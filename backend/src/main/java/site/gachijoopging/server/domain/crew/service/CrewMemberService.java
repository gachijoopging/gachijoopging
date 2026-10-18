package site.gachijoopging.server.domain.crew.service;

import java.sql.Date;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.crew.dto.MemberProfileResponse;
import site.gachijoopging.server.domain.crew.dto.MemberResponse;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;
import site.gachijoopging.server.domain.crew.entity.Crew;
import site.gachijoopging.server.domain.crew.event.MemberExpelledEvent;
import site.gachijoopging.server.domain.crew.repository.CrewJoinRequestRepository;
import site.gachijoopging.server.domain.crew.repository.CrewQueryRepository;
import site.gachijoopging.server.domain.crew.repository.CrewQueryRepository.MemberRow;
import site.gachijoopging.server.domain.crew.repository.CrewRepository;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.lock.UserLock;
import site.gachijoopging.server.global.security.CrewMembership;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CrewMemberService {

  private static final ZoneId KST = ZoneId.of("Asia/Seoul");

  private final CrewRepository crewRepository;
  private final UserLock userLock;
  private final CrewQueryRepository crewQueryRepository;
  private final CrewJoinRequestRepository joinRequestRepository;
  private final CrewService crewService;
  private final ApplicationEventPublisher events;
  private final Clock clock;

  public List<MemberResponse> members(UUID me, CrewMembership membership) {
    return crewQueryRepository.findMembers(membership.crewId(), me, null).stream()
        .map(this::member)
        .toList();
  }

  public MemberProfileResponse profile(UUID me, CrewMembership membership, UUID userId) {
    MemberRow row =
        crewQueryRepository.findMembers(membership.crewId(), me, userId).stream()
            .findFirst()
            .orElseThrow(CrewMemberService::notMember);
    UserBriefResponse brief = brief(row);
    Instant since = LocalDate.now(clock.withZone(KST)).minusMonths(6).atStartOfDay(KST).toInstant();
    return new MemberProfileResponse(
        brief.id(),
        brief.nickname(),
        brief.photoUrl(),
        brief.withdrawn(),
        row.getLeader(),
        row.getJoinedAt(),
        row.getFollowing(),
        row.getIntro(),
        row.getBlocked(),
        row.getTotalItems(),
        row.getTotalDistanceM(),
        row.getTotalActivities(),
        crewQueryRepository.findActiveDays(membership.crewId(), userId, since).stream()
            .map(Date::toLocalDate)
            .toList());
  }

  @Transactional
  public void changeLeader(UUID me, CrewMembership membership, UUID userId) {
    Crew crew = lockLedBy(me, membership);
    requireOther(me, userId);
    if (!crewRepository.isMember(crew.getId(), userId)) {
      throw notMember();
    }
    crew.changeLeader(userId, clock.instant());
  }

  @Transactional
  public void expel(UUID me, CrewMembership membership, UUID userId) {
    Crew crew = lockLedBy(me, membership);
    requireOther(me, userId);
    if (crewRepository.deleteMember(crew.getId(), userId) == 0) {
      throw notMember();
    }
    crewRepository.recordExpulsion(crew.getId(), userId, me, clock.instant());
    events.publishEvent(new MemberExpelledEvent(crew.getId(), userId, me));
  }

  @Transactional
  public void leave(UUID me, CrewMembership membership) {
    userLock.lock(me);
    Crew crew = lockActive(membership);
    if (crewRepository.hasActivityInProgress(me)) {
      throw new BusinessException(ErrorCode.CONFLICT, "진행 중인 활동을 끝낸 뒤 나갈 수 있다");
    }
    boolean leader = crew.ledBy(me);
    if (leader && crewRepository.countMembers(crew.getId()) > 1) {
      throw new BusinessException(ErrorCode.LEADER_MUST_DELEGATE, "다른 크루원에게 크루장을 위임한 뒤 나갈 수 있다");
    }
    if (crewRepository.deleteMember(crew.getId(), me) == 0) {
      throw new BusinessException(ErrorCode.NO_CREW, "소속 크루가 없다");
    }
    if (leader) {
      Instant now = clock.instant();
      // 사라진 크루에 걸린 대기 신청이 남으면 신청자가 다른 크루를 찾지도 만들지도 못한다
      joinRequestRepository.cancelPendingForCrew(crew.getId(), now);
      crew.dissolve(now);
    }
  }

  // 위임·추방·나가기가 서로 엇갈리지 않도록 크루 행을 잠그고, 잠근 뒤의 leader_id 로 다시 대조한다
  private Crew lockLedBy(UUID me, CrewMembership membership) {
    membership.requireLeader();
    Crew crew = lockActive(membership);
    if (!crew.ledBy(me)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "크루장만 할 수 있다");
    }
    return crew;
  }

  private Crew lockActive(CrewMembership membership) {
    return crewRepository
        .findActiveForUpdate(membership.crewId())
        .orElseThrow(() -> new BusinessException(ErrorCode.NO_CREW, "소속 크루가 없다"));
  }

  private static void requireOther(UUID me, UUID userId) {
    if (me.equals(userId)) {
      throw new BusinessException(ErrorCode.VALIDATION, "자기 자신은 대상이 될 수 없다");
    }
  }

  private static BusinessException notMember() {
    return new BusinessException(ErrorCode.NOT_FOUND, "크루원이 아니다");
  }

  private MemberResponse member(MemberRow row) {
    UserBriefResponse brief = brief(row);
    return new MemberResponse(
        brief.id(),
        brief.nickname(),
        brief.photoUrl(),
        brief.withdrawn(),
        row.getLeader(),
        row.getTotalItems(),
        row.getJoinedAt(),
        row.getFollowing());
  }

  private UserBriefResponse brief(MemberRow row) {
    return crewService.brief(
        row.getId(), row.getNickname(), row.getPhotoMediaId(), row.getStatus());
  }
}
