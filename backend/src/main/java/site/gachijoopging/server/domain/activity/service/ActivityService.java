package site.gachijoopging.server.domain.activity.service;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.activity.dto.ActivityCardResponse;
import site.gachijoopging.server.domain.activity.dto.ActivityPhotoRef;
import site.gachijoopging.server.domain.activity.dto.ActivityResponse;
import site.gachijoopging.server.domain.activity.dto.ActivitySummaryResponse;
import site.gachijoopging.server.domain.activity.dto.AddItemsRequest;
import site.gachijoopging.server.domain.activity.dto.Bbox;
import site.gachijoopging.server.domain.activity.dto.EndActivityRequest;
import site.gachijoopging.server.domain.activity.dto.ItemInput;
import site.gachijoopging.server.domain.activity.dto.ItemResponse;
import site.gachijoopging.server.domain.activity.dto.NewActivityPhoto;
import site.gachijoopging.server.domain.activity.dto.PhotoResponse;
import site.gachijoopging.server.domain.activity.dto.StartActivityRequest;
import site.gachijoopging.server.domain.activity.dto.UpdateItemRequest;
import site.gachijoopging.server.domain.activity.entity.Activity;
import site.gachijoopging.server.domain.activity.entity.ActivityItem;
import site.gachijoopging.server.domain.activity.entity.ActivityStatus;
import site.gachijoopging.server.domain.activity.entity.ItemSource;
import site.gachijoopging.server.domain.activity.repository.ActivityItemRepository;
import site.gachijoopging.server.domain.activity.repository.ActivityQueryRepository;
import site.gachijoopging.server.domain.activity.repository.ActivityRepository;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;
import site.gachijoopging.server.domain.media.event.MediaQuarantineEvent;
import site.gachijoopging.server.domain.media.service.MediaSignedUrl;
import site.gachijoopging.server.domain.stats.dto.StatsDelta;
import site.gachijoopging.server.domain.stats.service.StatsService;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.lock.UserLock;
import site.gachijoopging.server.global.response.CursorPage;
import site.gachijoopging.server.global.response.Cursors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ActivityService {

  // AI 신뢰도가 이보다 낮으면 앱이 "확인 필요" 로 보인다 (feature-scope §AI 줍기)
  private static final float UNCLASSIFIED_BELOW = 0.7f;

  private static final String WITHDRAWN_NICKNAME = "탈퇴한 크루원";

  private final ActivityRepository activityRepository;
  private final ActivityItemRepository itemRepository;
  private final ActivityQueryRepository queryRepository;
  private final StatsService statsService;
  private final MediaSignedUrl signedUrl;
  private final ApplicationEventPublisher events;
  private final UserLock userLock;
  private final Clock clock;

  public record Started(boolean created, ActivityResponse activity) {}

  @Transactional
  public Started start(UUID me, StartActivityRequest request) {
    userLock.lock(me);
    Optional<Activity> same = activityRepository.findLive(request.id());
    if (same.isPresent()) {
      if (!same.get().ownedBy(me)) {
        throw forbidden();
      }
      return new Started(false, response(same.get()));
    }
    if (activityRepository.findInProgress(me).isPresent()) {
      throw new BusinessException(ErrorCode.CONFLICT, "진행 중인 활동이 있다");
    }
    UUID crewId =
        activityRepository
            .findCrewOf(me)
            .orElseThrow(() -> new BusinessException(ErrorCode.NO_CREW, "소속 크루가 없다"));
    // 남이 같은 id 로 동시에 시작했거나, 지워진 진행 중 활동이 한 사람 한 활동 제약에 걸린 경우다
    if (activityRepository.insertIfAbsent(
            request.id(), me, crewId, request.startedAt(), request.locationShared())
        == 0) {
      if (activityRepository.findById(request.id()).map(a -> !a.ownedBy(me)).orElse(false)) {
        throw forbidden();
      }
      throw new BusinessException(ErrorCode.CONFLICT, "진행 중인 활동이 있다");
    }
    return new Started(true, response(activityRepository.findById(request.id()).orElseThrow()));
  }

  public Optional<ActivityResponse> current(UUID me) {
    return activityRepository.findInProgress(me).map(this::response);
  }

  public boolean hasInProgress(UUID userId) {
    return activityRepository.existsByUserIdAndStatusAndDeletedAtIsNull(
        userId, ActivityStatus.IN_PROGRESS);
  }

  @Transactional
  public void pause(UUID me, UUID id) {
    lockInProgress(me, id).pause(clock.instant());
  }

  @Transactional
  public void resume(UUID me, UUID id) {
    lockInProgress(me, id).resume(clock.instant());
  }

  @Transactional
  public ActivitySummaryResponse addItems(UUID me, UUID id, AddItemsRequest request) {
    Activity activity = lockInProgress(me, id);
    UUID photoId = request.photoId();
    if (photoId != null && !activityRepository.hasPhoto(id, photoId)) {
      throw new BusinessException(ErrorCode.NOT_FOUND, "이 활동의 사진이 아니다");
    }
    for (ItemInput item : request.items()) {
      if (item.bbox() != null && photoId == null) {
        throw new BusinessException(ErrorCode.VALIDATION, "bbox 는 사진이 있을 때만 쓴다");
      }
      insert(id, photoId, item);
    }
    List<UUID> ids = request.items().stream().map(ItemInput::id).distinct().toList();
    Map<UUID, ActivityItem> saved =
        itemRepository.findAllById(ids).stream()
            .collect(Collectors.toMap(ActivityItem::getId, Function.identity()));
    if (saved.size() != ids.size()
        || saved.values().stream().anyMatch(item -> !item.getActivityId().equals(id))) {
      throw new BusinessException(ErrorCode.CONFLICT, "다른 활동에 쓰인 줍기 id 다");
    }
    recount(activity);
    return summary(activity, ids.stream().map(saved::get).map(ActivityService::item).toList());
  }

  // 끝난 활동도 본인은 기록 상세(5-3)에서 고친다
  @Transactional
  public ActivitySummaryResponse updateItem(
      UUID me, UUID id, UUID itemId, UpdateItemRequest request) {
    Activity activity = lockOwn(me, id);
    Map<String, Integer> before = activity.getByCategory();
    itemRepository
        .findByIdAndActivityId(itemId, id)
        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "없는 줍기다"))
        .change(request.category(), request.quantity());
    recount(activity, before);
    return summary(activity, List.of());
  }

  // 되돌리기는 앱이 디스크에 남겨 두고 재시도하므로, 이미 지운 줍기도 204 로 흡수한다 (화면 4-6)
  @Transactional
  public void deleteItem(UUID me, UUID id, UUID itemId) {
    Activity activity = lockOwn(me, id);
    Map<String, Integer> before = activity.getByCategory();
    itemRepository.findByIdAndActivityId(itemId, id).ifPresent(itemRepository::delete);
    recount(activity, before);
  }

  // 오프라인에서 끝낸 활동을 나중에 보내므로 재전송은 저장된 결과로 흡수하고 다시 적립하지 않는다
  @Transactional
  public ActivityResponse end(UUID me, UUID id, EndActivityRequest request) {
    Activity activity = lockOwn(me, id);
    if (activity.inProgress()) {
      requireEndable(activity, request);
      activity.end(
          request.endedAt(),
          request.durationSec(),
          request.pausedSec(),
          request.distanceM(),
          request.steps());
      // 점이 둘 미만이면 선이 되지 않는다. 짧은 활동도 저장해야 하므로 경로만 비워 둔다
      if (request.route().size() >= 2) {
        activityRepository.updateRoute(id, lineString(request.route()));
      }
      statsService.add(activity.getCrewId(), activity.getStartedAt(), totals(activity));
    }
    return response(activity, true);
  }

  // 본인은 이전 크루 기록까지, 남은 지금 같은 크루에서 한 활동만 본다
  public ActivityResponse detail(UUID me, UUID id) {
    Activity activity =
        activityRepository
            .findLive(id)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "없는 활동이다"));
    if (activity.ownedBy(me)) {
      return response(activity, true);
    }
    if (!activityRepository.findCrewOf(me).map(activity.getCrewId()::equals).orElse(false)) {
      throw forbidden();
    }
    return response(activity, activity.isLocationShared());
  }

  // 앱 대기열이 재시도하므로 이미 지운 활동도 204 로 흡수한다. 다시 빼지 않는다
  @Transactional
  public void delete(UUID me, UUID id) {
    Activity activity = activityRepository.findLiveForUpdate(id).orElse(null);
    if (activity == null) {
      return;
    }
    if (!activity.ownedBy(me)) {
      throw forbidden();
    }
    // 지운 진행 중 활동은 한 사람 한 활동 제약에 남아 다음 시작을 막는다 (화면 5-3: 저장 완료 활동만 삭제)
    if (activity.inProgress()) {
      throw new BusinessException(ErrorCode.CONFLICT, "진행 중인 활동이다");
    }
    activity.delete(clock.instant());
    statsService.add(activity.getCrewId(), activity.getStartedAt(), totals(activity).negate());
    List<String> keys = new ArrayList<>();
    queryRepository
        .findPhotos(id)
        .forEach(
            photo -> {
              keys.add(photo.getObjectKey());
              keys.add(photo.getThumbKey());
            });
    events.publishEvent(new MediaQuarantineEvent(keys));
  }

  public CursorPage<ActivityCardResponse> mine(UUID me, String cursor, int limit) {
    List<ActivityQueryRepository.CardRow> rows;
    if (cursor == null) {
      rows = queryRepository.findMine(me, limit + 1);
    } else {
      Cursors.Cursor before = Cursors.decode(cursor);
      rows = queryRepository.findMineBefore(me, before.createdAt(), before.id(), limit + 1);
    }
    List<ActivityQueryRepository.CardRow> page = rows.subList(0, Math.min(limit, rows.size()));
    String next =
        rows.size() > limit
            ? Cursors.encode(page.getLast().getStartedAt(), page.getLast().getId())
            : null;
    return new CursorPage<>(page.stream().map(this::card).toList(), next);
  }

  /** 사진 파일을 저장하기 전에 부른다. 끝난 활동이면 앱이 4-3 으로 돌아가도록 404 다 (화면 4-4). */
  public void requirePhotoTarget(UUID me, UUID activityId) {
    photoTarget(me, activityRepository.findLive(activityId));
  }

  // media 의 트랜잭션에 합류해 media 행과 함께 커밋되거나 함께 사라진다
  @Transactional
  public UUID addPhoto(UUID me, NewActivityPhoto photo) {
    photoTarget(me, activityRepository.findLiveForUpdate(photo.activityId()));
    activityRepository.insertPhotoIfAbsent(
        UUID.randomUUID(),
        photo.activityId(),
        photo.mediaId(),
        photo.lat(),
        photo.lng(),
        photo.takenAt(),
        photo.inferenceStatus(),
        photo.modelVersion(),
        photo.inferenceMs());
    ActivityRepository.PhotoRow saved =
        activityRepository
            .findPhotoByMedia(photo.mediaId())
            .orElseThrow(() -> new BusinessException(ErrorCode.INTERNAL, "넣은 활동 사진이 없다"));
    if (!saved.getActivityId().equals(photo.activityId())) {
      throw new BusinessException(ErrorCode.CONFLICT, "다른 활동에 올린 사진이다");
    }
    return saved.getId();
  }

  public Optional<ActivityPhotoRef> photoOf(UUID mediaId) {
    return activityRepository
        .findPhotoByMedia(mediaId)
        .map(row -> new ActivityPhotoRef(row.getId(), row.getActivityId()));
  }

  // 사용자가 버린 사진만 지운다. 줍기가 붙은 사진을 지우면 확정한 줍기까지 CASCADE 로 사라진다
  @Transactional
  public void removePhoto(UUID me, UUID mediaId) {
    ActivityRepository.PhotoRow photo =
        activityRepository
            .findPhotoByMedia(mediaId)
            .orElseThrow(() -> new BusinessException(ErrorCode.CONFLICT, "활동 사진이 아니다"));
    Activity activity =
        activityRepository
            .findLiveForUpdate(photo.getActivityId())
            .orElseThrow(() -> new BusinessException(ErrorCode.CONFLICT, "지워진 활동의 사진이다"));
    if (!activity.ownedBy(me)) {
      throw forbidden();
    }
    if (!activity.inProgress()) {
      throw new BusinessException(ErrorCode.CONFLICT, "끝난 활동의 사진이다");
    }
    if (activityRepository.hasItemsOn(photo.getId())) {
      throw new BusinessException(ErrorCode.CONFLICT, "줍기가 붙은 사진이다");
    }
    activityRepository.deletePhoto(photo.getId());
  }

  private static void photoTarget(UUID me, Optional<Activity> found) {
    Activity activity =
        found.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "없는 활동이다"));
    if (!activity.ownedBy(me)) {
      throw forbidden();
    }
    if (!activity.inProgress()) {
      throw new BusinessException(ErrorCode.NOT_FOUND, "끝난 활동이다");
    }
  }

  private Activity lockOwn(UUID me, UUID id) {
    Activity activity =
        activityRepository
            .findLiveForUpdate(id)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "없는 활동이다"));
    if (!activity.ownedBy(me)) {
      throw forbidden();
    }
    return activity;
  }

  private Activity lockInProgress(UUID me, UUID id) {
    Activity activity = lockOwn(me, id);
    if (!activity.inProgress()) {
      throw new BusinessException(ErrorCode.CONFLICT, "끝난 활동이다");
    }
    return activity;
  }

  private void insert(UUID activityId, UUID photoId, ItemInput item) {
    Bbox bbox = item.bbox();
    Float confidence = item.aiConfidence();
    itemRepository.insertIfAbsent(
        item.id(),
        activityId,
        photoId,
        bbox == null ? null : bbox.x(),
        bbox == null ? null : bbox.y(),
        bbox == null ? null : bbox.w(),
        bbox == null ? null : bbox.h(),
        item.aiPredictedCategory() == null ? null : item.aiPredictedCategory().name(),
        confidence,
        item.category().name(),
        item.quantity(),
        item.aiPredictedCategory() != null && confidence != null && confidence < UNCLASSIFIED_BELOW,
        (item.aiPredictedCategory() == null ? ItemSource.MANUAL : ItemSource.AI).name());
  }

  private void recount(Activity activity) {
    activity.recount(itemRepository.findByActivityIdOrderById(activity.getId()));
  }

  // 끝난 활동은 이미 크루 합산에 들어가 있으므로 바뀐 만큼만 고친다
  private void recount(Activity activity, Map<String, Integer> before) {
    recount(activity);
    if (activity.inProgress()) {
      return;
    }
    Map<String, Integer> changed = new TreeMap<>(activity.getByCategory());
    before.forEach((category, quantity) -> changed.merge(category, -quantity, Integer::sum));
    changed.values().removeIf(quantity -> quantity == 0);
    if (!changed.isEmpty()) {
      statsService.add(
          activity.getCrewId(), activity.getStartedAt(), new StatsDelta(0, 0, 0, changed));
    }
  }

  private static void requireEndable(Activity activity, EndActivityRequest request) {
    if (request.endedAt().isBefore(activity.getStartedAt())) {
      throw new BusinessException(ErrorCode.VALIDATION, "endedAt 이 startedAt 보다 이르다");
    }
    // NaN·무한대는 어떤 비교도 거짓이라, 범위 안에 있는지를 물어야 함께 걸러진다
    for (List<Double> point : request.route()) {
      if (!(Math.abs(point.get(0)) <= 180 && Math.abs(point.get(1)) <= 90)) {
        throw new BusinessException(ErrorCode.VALIDATION, "route 의 좌표가 범위를 벗어났다");
      }
    }
  }

  private static StatsDelta totals(Activity activity) {
    return new StatsDelta(
        1, activity.getDurationSec(), activity.getDistanceM(), activity.getByCategory());
  }

  private static String lineString(List<List<Double>> route) {
    return route.stream()
        .map(
            point ->
                BigDecimal.valueOf(point.get(0)).toPlainString()
                    + " "
                    + BigDecimal.valueOf(point.get(1)).toPlainString())
        .collect(Collectors.joining(", ", "LINESTRING(", ")"));
  }

  private ActivityResponse response(Activity activity) {
    return response(activity, true);
  }

  private ActivityResponse response(Activity activity, boolean withRoute) {
    return new ActivityResponse(
        activity.getId(),
        user(activity.getUserId()),
        activity.getStatus().name(),
        activity.getStartedAt(),
        activity.getEndedAt(),
        activity.getDurationSec(),
        activity.getPausedSec(),
        activity.isPaused(),
        activity.getPausedAt(),
        activity.getDistanceM(),
        activity.getSteps(),
        activity.isLocationShared(),
        activity.getItemCount(),
        activity.getByCategory(),
        withRoute ? route(activity.getId()) : null,
        queryRepository.findPhotos(activity.getId()).stream()
            .map(
                photo ->
                    new PhotoResponse(
                        photo.getId(),
                        signedUrl.of(photo.getObjectKey()),
                        signedUrl.of(photo.getThumbKey()),
                        photo.getTakenAt()))
            .toList(),
        itemRepository.findByActivityIdOrderById(activity.getId()).stream()
            .map(ActivityService::item)
            .toList());
  }

  private List<List<Double>> route(UUID activityId) {
    return queryRepository.findRoute(activityId).stream()
        .map(point -> List.of(point.getLng(), point.getLat()))
        .toList();
  }

  // 탈퇴한 사람은 이름·사진 없이 "탈퇴한 크루원" 으로 보인다 (ERD 회원 탈퇴 때)
  private UserBriefResponse user(UUID userId) {
    ActivityQueryRepository.UserRow user = queryRepository.findUser(userId);
    if ("DELETED".equals(user.getStatus())) {
      return new UserBriefResponse(userId.toString(), WITHDRAWN_NICKNAME, null, true);
    }
    return new UserBriefResponse(
        userId.toString(),
        Objects.requireNonNullElse(user.getNickname(), ""),
        user.getPhotoKey() == null ? null : signedUrl.of(user.getPhotoKey()),
        false);
  }

  private ActivityCardResponse card(ActivityQueryRepository.CardRow row) {
    return new ActivityCardResponse(
        row.getId(),
        row.getStartedAt(),
        row.getDurationSec(),
        row.getDistanceM(),
        row.getItemCount(),
        row.getThumbKey() == null ? null : signedUrl.of(row.getThumbKey()));
  }

  private static ActivitySummaryResponse summary(Activity activity, List<ItemResponse> items) {
    return new ActivitySummaryResponse(activity.getItemCount(), activity.getByCategory(), items);
  }

  private static ItemResponse item(ActivityItem item) {
    Bbox bbox =
        item.getBboxX() == null
            ? null
            : new Bbox(item.getBboxX(), item.getBboxY(), item.getBboxW(), item.getBboxH());
    return new ItemResponse(
        item.getId(),
        item.getPhotoId(),
        item.getFinalCategory(),
        item.getQuantity(),
        item.getSource().name(),
        item.getAiConfidence(),
        item.isUnclassified(),
        bbox);
  }

  private static BusinessException forbidden() {
    return new BusinessException(ErrorCode.FORBIDDEN, "남의 활동이다");
  }
}
