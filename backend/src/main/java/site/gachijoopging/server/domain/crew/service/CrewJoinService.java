package site.gachijoopging.server.domain.crew.service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.crew.dto.DecideJoinRequestRequest.Decision;
import site.gachijoopging.server.domain.crew.dto.JoinRequestResponse;
import site.gachijoopging.server.domain.crew.entity.Crew;
import site.gachijoopging.server.domain.crew.entity.CrewJoinRequest;
import site.gachijoopging.server.domain.crew.entity.JoinRequestStatus;
import site.gachijoopging.server.domain.crew.event.JoinRequestDecidedEvent;
import site.gachijoopging.server.domain.crew.event.JoinRequestedEvent;
import site.gachijoopging.server.domain.crew.repository.CrewJoinRequestRepository;
import site.gachijoopging.server.domain.crew.repository.CrewRepository;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.response.CursorPage;
import site.gachijoopging.server.global.response.Cursors;
import site.gachijoopging.server.global.security.CrewMembership;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CrewJoinService {

  private final CrewRepository crewRepository;
  private final CrewJoinRequestRepository joinRequestRepository;
  private final CrewService crewService;
  private final ApplicationEventPublisher events;
  private final Clock clock;

  public record Applied(JoinRequestResponse request, boolean created) {}

  @Transactional
  public Applied apply(UUID me, String inviteCode) {
    Crew crew =
        crewRepository
            .findByInviteCodeAndDeletedAtIsNull(InviteCodes.canonical(inviteCode))
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "없는 초대 코드다"));
    if (crewRepository.findMembership(me).isPresent()) {
      throw new BusinessException(ErrorCode.ALREADY_IN_CREW, "이미 크루에 소속돼 있다");
    }
    return pendingFor(me, crew.getId()).orElseGet(() -> applyNew(me, crew));
  }

  private Applied applyNew(UUID me, Crew crew) {
    Instant now = clock.instant();
    joinRequestRepository.cancelPending(me, now);
    UUID requestId = UUID.randomUUID();
    if (joinRequestRepository.insertPendingIfAbsent(requestId, crew.getId(), me, now) == 0) {
      // 같은 순간 다른 요청이 먼저 넣었다. 새 문장은 그 커밋을 보므로 같은 크루면 그 신청으로 흡수한다
      return pendingFor(me, crew.getId())
          .orElseThrow(() -> new BusinessException(ErrorCode.CONFLICT, "다른 요청이 먼저 가입 신청을 만들었다"));
    }
    events.publishEvent(new JoinRequestedEvent(requestId, crew.getId(), crew.getLeaderId(), me));
    return new Applied(view(requireRequest(joinRequestRepository.findById(requestId))), true);
  }

  private Optional<Applied> pendingFor(UUID me, UUID crewId) {
    return joinRequestRepository
        .findByUserIdAndStatus(me, JoinRequestStatus.PENDING)
        .filter(request -> request.getCrewId().equals(crewId))
        .map(request -> new Applied(view(request), false));
  }

  public Optional<JoinRequestResponse> mine(UUID me) {
    return joinRequestRepository.findFirstByUserIdOrderByCreatedAtDesc(me).map(this::view);
  }

  @Transactional
  public void cancelMine(UUID me) {
    joinRequestRepository.cancelPending(me, clock.instant());
  }

  public CursorPage<JoinRequestResponse> pending(
      CrewMembership membership, String cursor, int limit) {
    membership.requireLeader();
    List<CrewJoinRequest> rows =
        cursor == null
            ? joinRequestRepository.findPendingFirstPage(membership.crewId(), limit + 1)
            : after(membership.crewId(), Cursors.decode(cursor), limit + 1);
    List<CrewJoinRequest> page = rows.subList(0, Math.min(limit, rows.size()));
    String next =
        rows.size() > limit
            ? Cursors.encode(page.getLast().getCreatedAt(), page.getLast().getId())
            : null;
    return new CursorPage<>(page.stream().map(this::view).toList(), next);
  }

  @Transactional
  public void decide(UUID me, CrewMembership membership, UUID requestId, Decision decision) {
    membership.requireLeader();
    CrewJoinRequest request =
        requireRequest(joinRequestRepository.findByIdAndCrewId(requestId, membership.crewId()));
    if (request.getStatus() != JoinRequestStatus.PENDING) {
      throw new BusinessException(ErrorCode.CONFLICT, "이미 처리된 가입 신청이다");
    }
    Instant now = clock.instant();
    boolean approve = decision == Decision.APPROVE;
    JoinRequestStatus result = approve ? JoinRequestStatus.APPROVED : JoinRequestStatus.REJECTED;
    if (joinRequestRepository.closeIfPending(requestId, result, me, now) == 0) {
      throw new BusinessException(ErrorCode.CONFLICT, "이미 처리된 가입 신청이다");
    }
    if (approve
        && crewRepository.insertMemberIfAbsent(membership.crewId(), request.getUserId(), now)
            == 0) {
      throw new BusinessException(ErrorCode.ALREADY_IN_CREW, "신청자가 이미 크루에 소속돼 있다");
    }
    events.publishEvent(
        new JoinRequestDecidedEvent(requestId, membership.crewId(), request.getUserId(), approve));
  }

  private List<CrewJoinRequest> after(UUID crewId, Cursors.Cursor cursor, int limit) {
    return joinRequestRepository.findPendingAfter(crewId, cursor.createdAt(), cursor.id(), limit);
  }

  private static CrewJoinRequest requireRequest(Optional<CrewJoinRequest> request) {
    return request.orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "없는 가입 신청이다"));
  }

  private JoinRequestResponse view(CrewJoinRequest request) {
    Crew crew =
        crewRepository
            .findById(request.getCrewId())
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "없는 크루다"));
    return new JoinRequestResponse(
        request.getId().toString(),
        new JoinRequestResponse.CrewRef(crew.getId().toString(), crew.getName()),
        crewService.brief(request.getUserId()),
        request.getStatus().name(),
        request.getCreatedAt());
  }
}
