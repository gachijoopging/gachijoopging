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
import site.gachijoopging.server.domain.crew.entity.JoinPolicy;
import site.gachijoopging.server.domain.crew.entity.JoinRequestStatus;
import site.gachijoopging.server.domain.crew.event.CrewJoinedEvent;
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
  public Applied apply(UUID me, UUID crewId) {
    crewRepository.lockUser(me);
    if (crewRepository.findMembership(me).isPresent()) {
      throw new BusinessException(ErrorCode.ALREADY_IN_CREW, "이미 크루에 소속돼 있다");
    }
    Crew crew =
        crewRepository
            .findActiveForUpdate(crewId)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "없는 크루다"));
    Optional<CrewJoinRequest> pending =
        joinRequestRepository.findByUserIdAndStatus(me, JoinRequestStatus.PENDING);
    if (pending.isPresent()) {
      if (pending.get().getCrewId().equals(crewId)) {
        return new Applied(view(pending.get()), false);
      }
      throw new BusinessException(ErrorCode.JOIN_REQUEST_PENDING, "승인 대기 중인 가입 신청이 있다");
    }
    if (crewRepository.wasExpelled(crewId, me)) {
      throw new BusinessException(ErrorCode.EXPELLED_FROM_CREW, "추방된 크루에는 다시 가입할 수 없다");
    }
    return crew.getJoinPolicy() == JoinPolicy.OPEN ? joinOpen(me, crew) : applyNew(me, crew);
  }

  private Applied joinOpen(UUID me, Crew crew) {
    Instant now = clock.instant();
    crewService.admit(crew.getId(), me, now);
    UUID requestId = UUID.randomUUID();
    joinRequestRepository.insertApproved(requestId, crew.getId(), me, now);
    events.publishEvent(new CrewJoinedEvent(crew.getId(), crew.getLeaderId(), me));
    return new Applied(view(requireRequest(joinRequestRepository.findById(requestId))), true);
  }

  private Applied applyNew(UUID me, Crew crew) {
    crewService.requireSeat(crew.getId());
    Instant now = clock.instant();
    UUID requestId = UUID.randomUUID();
    if (joinRequestRepository.insertPendingIfAbsent(requestId, crew.getId(), me, now) == 0) {
      // 같은 순간 다른 요청이 먼저 넣었다. 새 문장은 그 커밋을 보므로 같은 크루면 그 신청으로 흡수한다
      return pendingFor(me, crew.getId())
          .orElseThrow(
              () -> new BusinessException(ErrorCode.JOIN_REQUEST_PENDING, "승인 대기 중인 가입 신청이 있다"));
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

  @Transactional
  public void markRejectionRead(UUID me, UUID requestId) {
    if (joinRequestRepository.markRejectionRead(requestId, me, clock.instant()) == 0) {
      throw new BusinessException(ErrorCode.NOT_FOUND, "없는 거절 신청이다");
    }
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
    crewRepository
        .findActiveForUpdate(membership.crewId())
        .orElseThrow(() -> new BusinessException(ErrorCode.NO_CREW, "소속 크루가 없다"));
    CrewJoinRequest request =
        requireRequest(joinRequestRepository.findByIdAndCrewId(requestId, membership.crewId()));
    if (request.getStatus() != JoinRequestStatus.PENDING) {
      throw new BusinessException(ErrorCode.CONFLICT, "이미 처리된 가입 신청이다");
    }
    Instant now = clock.instant();
    boolean approve = decision == Decision.APPROVE;
    if (approve) {
      crewService.admit(membership.crewId(), request.getUserId(), now);
    }
    JoinRequestStatus result = approve ? JoinRequestStatus.APPROVED : JoinRequestStatus.REJECTED;
    if (joinRequestRepository.closeIfPending(requestId, result, me, now) == 0) {
      throw new BusinessException(ErrorCode.CONFLICT, "이미 처리된 가입 신청이다");
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
