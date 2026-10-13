package site.gachijoopging.server.domain.activity.service;

import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.activity.dto.ActivityResponse;
import site.gachijoopging.server.domain.activity.dto.ActivitySummaryResponse;
import site.gachijoopging.server.domain.activity.dto.AddItemsRequest;
import site.gachijoopging.server.domain.activity.dto.Bbox;
import site.gachijoopging.server.domain.activity.dto.ItemInput;
import site.gachijoopging.server.domain.activity.dto.ItemResponse;
import site.gachijoopging.server.domain.activity.dto.StartActivityRequest;
import site.gachijoopging.server.domain.activity.dto.UpdateItemRequest;
import site.gachijoopging.server.domain.activity.entity.Activity;
import site.gachijoopging.server.domain.activity.entity.ActivityItem;
import site.gachijoopging.server.domain.activity.entity.ActivityStatus;
import site.gachijoopging.server.domain.activity.entity.ItemSource;
import site.gachijoopging.server.domain.activity.repository.ActivityItemRepository;
import site.gachijoopging.server.domain.activity.repository.ActivityRepository;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.lock.UserLock;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ActivityService {

  // AI 신뢰도가 이보다 낮으면 앱이 "확인 필요" 로 보인다 (feature-scope §AI 줍기)
  private static final float UNCLASSIFIED_BELOW = 0.7f;

  private final ActivityRepository activityRepository;
  private final ActivityItemRepository itemRepository;
  private final UserLock userLock;
  private final Clock clock;

  public record Started(boolean created, ActivityResponse activity) {}

  @Transactional
  public Started start(UUID me, StartActivityRequest request) {
    userLock.lock(me);
    Optional<Activity> same = activityRepository.findById(request.id());
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
      if (activityRepository.findById(request.id()).isPresent()) {
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

  @Transactional
  public ActivitySummaryResponse updateItem(
      UUID me, UUID id, UUID itemId, UpdateItemRequest request) {
    Activity activity = lockInProgress(me, id);
    itemRepository
        .findByIdAndActivityId(itemId, id)
        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "없는 줍기다"))
        .change(request.category(), request.quantity());
    recount(activity);
    return summary(activity, List.of());
  }

  // 되돌리기는 앱이 디스크에 남겨 두고 재시도하므로, 이미 지운 줍기도 204 로 흡수한다 (화면 4-6)
  @Transactional
  public void deleteItem(UUID me, UUID id, UUID itemId) {
    Activity activity = lockInProgress(me, id);
    itemRepository.findByIdAndActivityId(itemId, id).ifPresent(itemRepository::delete);
    recount(activity);
  }

  private Activity lockInProgress(UUID me, UUID id) {
    Activity activity =
        activityRepository
            .findLiveForUpdate(id)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "없는 활동이다"));
    if (!activity.ownedBy(me)) {
      throw forbidden();
    }
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
        confidence != null && confidence < UNCLASSIFIED_BELOW,
        (item.aiPredictedCategory() == null ? ItemSource.MANUAL : ItemSource.AI).name());
  }

  private void recount(Activity activity) {
    activity.recount(itemRepository.findByActivityIdOrderById(activity.getId()));
  }

  private ActivityResponse response(Activity activity) {
    return new ActivityResponse(
        activity.getId(),
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
        itemRepository.findByActivityIdOrderById(activity.getId()).stream()
            .map(ActivityService::item)
            .toList());
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
