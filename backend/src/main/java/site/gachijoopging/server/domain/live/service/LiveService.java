package site.gachijoopging.server.domain.live.service;

import java.time.Clock;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;
import site.gachijoopging.server.domain.live.dto.LiveMemberResponse;
import site.gachijoopging.server.domain.live.dto.LiveUpdateResponse;
import site.gachijoopging.server.domain.live.dto.LngLat;
import site.gachijoopging.server.domain.live.dto.ReportLiveRequest;
import site.gachijoopging.server.domain.live.event.LiveEndedEvent;
import site.gachijoopging.server.domain.live.event.LiveStartedEvent;
import site.gachijoopging.server.domain.live.event.LiveUpdatedEvent;
import site.gachijoopging.server.domain.live.repository.LiveLocationRepository;
import site.gachijoopging.server.domain.live.repository.LiveLocationRepository.ActivityRow;
import site.gachijoopging.server.domain.live.repository.LiveLocationRepository.LiveMemberRow;
import site.gachijoopging.server.domain.media.service.MediaSignedUrl;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class LiveService {

  private static final String WITHDRAWN_NICKNAME = "탈퇴한 크루원";

  private final LiveLocationRepository repository;
  private final MediaSignedUrl signedUrl;
  private final ApplicationEventPublisher events;
  private final Clock clock;

  // 공유 여부는 앱이 보낸 좌표가 아니라 활동에 저장된 값으로 정한다.
  // 종료와 엇갈려 늦게 온 보고는 조용히 버린다 — 앱이 오프라인 큐로 다시 보내기 때문이다
  @Transactional
  public void report(UUID me, UUID activityId, ReportLiveRequest request) {
    if (activityId == null) {
      throw new BusinessException(ErrorCode.VALIDATION, "activityId 가 없다");
    }
    ActivityRow activity =
        repository
            .findActivity(activityId)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "없는 활동이다"));
    if (!activity.userId().equals(me)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "남의 활동이다");
    }
    LngLat location = activity.locationShared() ? request.location() : null;
    if (repository.upsertIfInProgress(
            activityId,
            location,
            request.distanceM(),
            request.itemCount(),
            request.elapsedSec(),
            request.paused(),
            clock.instant())
        == 0) {
      return;
    }
    events.publishEvent(
        new LiveUpdatedEvent(
            activity.crewId(),
            me,
            activityId,
            new LiveUpdateResponse(
                me.toString(),
                activity.locationShared(),
                location,
                request.distanceM(),
                request.itemCount(),
                request.elapsedSec(),
                request.paused())));
  }

  // 활동을 시작·종료하는 트랜잭션 안에서만 부른다. 첫 보고 전에도 활동 중 목록에 보이게 시작 때 행을 만든다
  @Transactional(propagation = Propagation.MANDATORY)
  public void started(UUID userId, UUID activityId, UUID crewId) {
    repository.upsertIfInProgress(activityId, null, 0, 0, 0, false, clock.instant());
    events.publishEvent(new LiveStartedEvent(crewId, userId));
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void ended(UUID userId, UUID activityId, UUID crewId) {
    repository.delete(userId, activityId);
    events.publishEvent(new LiveEndedEvent(crewId, userId, activityId));
  }

  public List<LiveMemberResponse> crewLive(UUID me, UUID crewId) {
    return repository.findCrew(crewId, me).stream().map(this::member).toList();
  }

  public Optional<LiveMemberResponse> member(UUID userId) {
    return repository.findMember(userId).map(this::member);
  }

  private LiveMemberResponse member(LiveMemberRow row) {
    return new LiveMemberResponse(
        brief(row),
        row.activityId().toString(),
        row.startedAt(),
        row.elapsedSec(),
        row.distanceM(),
        row.itemCount(),
        row.paused(),
        row.locationShared(),
        row.locationShared() ? row.location() : null);
  }

  private UserBriefResponse brief(LiveMemberRow row) {
    if ("DELETED".equals(row.userStatus())) {
      return new UserBriefResponse(row.userId().toString(), WITHDRAWN_NICKNAME, null, true);
    }
    return new UserBriefResponse(
        row.userId().toString(),
        Objects.requireNonNullElse(row.nickname(), ""),
        row.photoKey() == null ? null : signedUrl.of(row.photoKey()),
        false);
  }
}
