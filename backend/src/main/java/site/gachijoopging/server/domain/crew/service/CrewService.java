package site.gachijoopging.server.domain.crew.service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.crew.dto.CreateCrewRequest;
import site.gachijoopging.server.domain.crew.dto.CrewResponse;
import site.gachijoopging.server.domain.crew.dto.CrewSummaryResponse;
import site.gachijoopging.server.domain.crew.dto.UpdateCrewRequest;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;
import site.gachijoopging.server.domain.crew.entity.Crew;
import site.gachijoopging.server.domain.crew.entity.JoinPolicy;
import site.gachijoopging.server.domain.crew.entity.JoinRequestStatus;
import site.gachijoopging.server.domain.crew.entity.Region;
import site.gachijoopging.server.domain.crew.event.JoinRequestDecidedEvent;
import site.gachijoopging.server.domain.crew.repository.CrewJoinRequestRepository;
import site.gachijoopging.server.domain.crew.repository.CrewQueryRepository;
import site.gachijoopging.server.domain.crew.repository.CrewQueryRepository.CrewSummaryRow;
import site.gachijoopging.server.domain.crew.repository.CrewQueryRepository.UserBriefRow;
import site.gachijoopging.server.domain.crew.repository.CrewRepository;
import site.gachijoopging.server.domain.media.service.MediaService;
import site.gachijoopging.server.domain.media.service.MediaSignedUrl;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.response.CursorPage;
import site.gachijoopging.server.global.response.Cursors;
import site.gachijoopging.server.global.security.CrewMembership;
import site.gachijoopging.server.global.security.CrewMembershipLoader;

@Service
@RequiredArgsConstructor
public class CrewService implements CrewMembershipLoader {

  static final int CAPACITY = 50;

  private static final String WITHDRAWN_NICKNAME = "탈퇴한 크루원";

  private final CrewRepository crewRepository;
  private final CrewQueryRepository crewQueryRepository;
  private final CrewJoinRequestRepository joinRequestRepository;
  private final MediaService mediaService;
  private final MediaSignedUrl mediaSignedUrl;
  private final ApplicationEventPublisher events;
  private final Clock clock;

  @Override
  @Transactional(readOnly = true)
  public Optional<CrewMembership> membershipOf(UUID userId) {
    return crewRepository
        .findMembership(userId)
        .map(row -> new CrewMembership(row.getCrewId(), row.getLeaderId().equals(userId)));
  }

  @Transactional
  public CrewResponse create(UUID me, CreateCrewRequest request) {
    String name = trimmedName(request.name());
    crewRepository.lockUser(me);
    requireNoCrewNorPending(me);
    UUID crewId = UUID.randomUUID();
    Instant now = clock.instant();
    if (crewRepository.existsByNameAndDeletedAtIsNull(name)
        || crewRepository.insertIfAbsent(
                crewId,
                name,
                Objects.requireNonNullElse(request.intro(), ""),
                me,
                request.region().name(),
                request.joinPolicy().name(),
                now)
            == 0) {
      throw new BusinessException(ErrorCode.CREW_NAME_TAKEN, "이미 쓰는 크루 이름이다");
    }
    if (crewRepository.insertMemberIfAbsent(crewId, me, now) == 0) {
      throw new BusinessException(ErrorCode.ALREADY_IN_CREW, "이미 크루에 소속돼 있다");
    }
    return view(activeCrew(crewId), me);
  }

  @Transactional(readOnly = true)
  public CursorPage<CrewSummaryResponse> search(
      UUID me, String query, Region region, String cursor, int limit) {
    requireNoCrewNorPending(me);
    String keyword = query == null || query.isBlank() ? null : query.strip();
    List<CrewSummaryRow> rows =
        crewQueryRepository.search(
            keyword,
            region == null ? null : region.name(),
            cursor == null ? null : Cursors.decodeText(cursor),
            limit + 1);
    List<CrewSummaryRow> page = rows.subList(0, Math.min(limit, rows.size()));
    String next = rows.size() > limit ? Cursors.encodeText(page.getLast().getName()) : null;
    return new CursorPage<>(page.stream().map(this::summary).toList(), next);
  }

  // 검색·만들기·가입은 미가입자 전용이고, 대기 신청은 자동 취소하지 않는다 — 사용자가 1-9 에서 직접 취소한다
  void requireNoCrewNorPending(UUID me) {
    if (crewRepository.findMembership(me).isPresent()) {
      throw new BusinessException(ErrorCode.ALREADY_IN_CREW, "이미 크루에 소속돼 있다");
    }
    if (joinRequestRepository.findByUserIdAndStatus(me, JoinRequestStatus.PENDING).isPresent()) {
      throw new BusinessException(ErrorCode.JOIN_REQUEST_PENDING, "승인 대기 중인 가입 신청이 있다");
    }
  }

  // 호출자가 findActiveForUpdate 로 그 크루 행을 잠근 트랜잭션 안에서만 부른다
  void admit(UUID crewId, UUID userId, Instant now) {
    requireSeat(crewId);
    if (crewRepository.insertMemberIfAbsent(crewId, userId, now) == 0) {
      throw new BusinessException(ErrorCode.ALREADY_IN_CREW, "이미 크루에 소속돼 있다");
    }
  }

  void requireSeat(UUID crewId) {
    if (crewRepository.countMembers(crewId) >= CAPACITY) {
      throw new BusinessException(ErrorCode.CREW_FULL, "크루 정원이 찼다");
    }
  }

  @Transactional(readOnly = true)
  public CrewResponse get(UUID me, CrewMembership membership) {
    return view(activeCrew(membership.crewId()), me);
  }

  @Transactional
  public CrewResponse update(UUID me, CrewMembership membership, UpdateCrewRequest request) {
    membership.requireLeader();
    Crew crew =
        crewRepository
            .findActiveForUpdate(membership.crewId())
            .orElseThrow(() -> new BusinessException(ErrorCode.NO_CREW, "소속 크루가 없다"));
    if (!crew.ledBy(me)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "크루장만 할 수 있다");
    }
    String name = request.name() == null ? null : trimmedName(request.name());
    if (name != null && crewRepository.existsByNameAndIdNotAndDeletedAtIsNull(name, crew.getId())) {
      throw new BusinessException(ErrorCode.CREW_NAME_TAKEN, "이미 쓰는 크루 이름이다");
    }
    if (request.photoMediaId() != null) {
      request.photoMediaId().ifPresent(mediaId -> mediaService.requireOwnedBy(mediaId, me));
    }
    Instant now = clock.instant();
    if (crew.getJoinPolicy() == JoinPolicy.APPROVAL && request.joinPolicy() == JoinPolicy.OPEN) {
      admitAllPending(crew, me, now);
    }
    crew.update(
        name,
        request.intro(),
        request.photoMediaId(),
        request.region(),
        request.joinPolicy(),
        request.goalCount(),
        now);
    return view(crew, me);
  }

  // 일부만 가입시키면 남은 신청이 공개 크루에 영영 대기로 남으므로 전부 넣거나 전환을 막는다
  private void admitAllPending(Crew crew, UUID me, Instant now) {
    if (crewRepository.countMembers(crew.getId())
            + joinRequestRepository.countAdmissiblePending(crew.getId())
        > CAPACITY) {
      throw new BusinessException(ErrorCode.CREW_FULL, "대기 신청을 모두 받으면 정원을 넘는다");
    }
    joinRequestRepository
        .approveAllAdmissible(crew.getId(), me, now)
        .forEach(
            row ->
                events.publishEvent(
                    new JoinRequestDecidedEvent(
                        row.getRequestId(), crew.getId(), row.getUserId(), true)));
  }

  private Crew activeCrew(UUID crewId) {
    return crewRepository
        .findByIdAndDeletedAtIsNull(crewId)
        .orElseThrow(() -> new BusinessException(ErrorCode.NO_CREW, "소속 크루가 없다"));
  }

  private CrewResponse view(Crew crew, UUID me) {
    boolean leader = crew.ledBy(me);
    return new CrewResponse(
        crew.getId().toString(),
        crew.getName(),
        crew.getIntro(),
        photoUrl(crew.getPhotoMediaId()),
        brief(crew.getLeaderId()),
        crew.getRegion(),
        crew.getJoinPolicy(),
        crewRepository.countMembers(crew.getId()),
        crew.getGoalCount(),
        leader ? crewRepository.countPendingJoinRequests(crew.getId()) : 0,
        null,
        0,
        leader);
  }

  private CrewSummaryResponse summary(CrewSummaryRow row) {
    return new CrewSummaryResponse(
        row.getId().toString(),
        row.getName(),
        row.getIntro(),
        photoUrl(row.getPhotoMediaId()),
        Region.valueOf(row.getRegion()),
        JoinPolicy.valueOf(row.getJoinPolicy()),
        row.getMemberCount(),
        brief(
            row.getLeaderId(),
            row.getLeaderNickname(),
            row.getLeaderPhotoMediaId(),
            row.getLeaderStatus()));
  }

  public UserBriefResponse brief(UUID userId) {
    UserBriefRow user = crewQueryRepository.findUserBrief(userId);
    return brief(user.getId(), user.getNickname(), user.getPhotoMediaId(), user.getStatus());
  }

  UserBriefResponse brief(UUID id, String nickname, UUID photoMediaId, String status) {
    if ("DELETED".equals(status)) {
      return new UserBriefResponse(id.toString(), WITHDRAWN_NICKNAME, null, true);
    }
    return new UserBriefResponse(
        id.toString(), Objects.requireNonNullElse(nickname, ""), photoUrl(photoMediaId), false);
  }

  private String photoUrl(UUID photoMediaId) {
    if (photoMediaId == null) {
      return null;
    }
    return mediaService
        .find(photoMediaId)
        .map(media -> mediaSignedUrl.of(media.objectKey()))
        .orElse(null);
  }

  private static String trimmedName(String raw) {
    String name = raw.strip();
    if (name.length() < 2 || name.length() > 20) {
      throw new BusinessException(ErrorCode.VALIDATION, "크루 이름은 앞뒤 공백을 뺀 2~20자다");
    }
    return name;
  }
}
