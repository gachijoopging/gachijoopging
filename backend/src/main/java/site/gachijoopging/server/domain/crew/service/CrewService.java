package site.gachijoopging.server.domain.crew.service;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.crew.dto.CreateCrewRequest;
import site.gachijoopging.server.domain.crew.dto.CrewPreviewResponse;
import site.gachijoopging.server.domain.crew.dto.CrewResponse;
import site.gachijoopging.server.domain.crew.dto.InviteCodeResponse;
import site.gachijoopging.server.domain.crew.dto.UpdateCrewRequest;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;
import site.gachijoopging.server.domain.crew.entity.Crew;
import site.gachijoopging.server.domain.crew.repository.CrewJoinRequestRepository;
import site.gachijoopging.server.domain.crew.repository.CrewQueryRepository;
import site.gachijoopging.server.domain.crew.repository.CrewQueryRepository.UserBriefRow;
import site.gachijoopging.server.domain.crew.repository.CrewRepository;
import site.gachijoopging.server.domain.media.service.MediaService;
import site.gachijoopging.server.domain.media.service.MediaSignedUrl;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.security.CrewMembership;
import site.gachijoopging.server.global.security.CrewMembershipLoader;

@Service
@RequiredArgsConstructor
public class CrewService implements CrewMembershipLoader {

  private static final int INVITE_CODE_ATTEMPTS = 5;

  private static final String WITHDRAWN_NICKNAME = "탈퇴한 크루원";

  private final CrewRepository crewRepository;
  private final CrewQueryRepository crewQueryRepository;
  private final CrewJoinRequestRepository joinRequestRepository;
  private final MediaService mediaService;
  private final MediaSignedUrl mediaSignedUrl;
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
    if (crewRepository.findMembership(me).isPresent()) {
      throw new BusinessException(ErrorCode.ALREADY_IN_CREW, "이미 크루에 소속돼 있다");
    }
    UUID crewId = UUID.randomUUID();
    Instant now = clock.instant();
    insertCrew(crewId, name, me, now);
    if (crewRepository.insertMemberIfAbsent(crewId, me, now) == 0) {
      throw new BusinessException(ErrorCode.ALREADY_IN_CREW, "이미 크루에 소속돼 있다");
    }
    // 내 크루가 생겼으니 다른 크루에 넣어 둔 신청은 승인될 수 없다 — 크루장 목록에 남기지 않는다
    joinRequestRepository.cancelPending(me, now);
    return view(activeCrew(crewId), me);
  }

  @Transactional(readOnly = true)
  public CrewResponse get(UUID me, CrewMembership membership) {
    return view(activeCrew(membership.crewId()), me);
  }

  @Transactional
  public CrewResponse update(UUID me, CrewMembership membership, UpdateCrewRequest request) {
    membership.requireLeader();
    Crew crew = activeCrew(membership.crewId());
    if (!crew.ledBy(me)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "크루장만 할 수 있다");
    }
    String name = request.name() == null ? null : trimmedName(request.name());
    if (name != null && crewRepository.existsByNameAndIdNot(name, crew.getId())) {
      throw new BusinessException(ErrorCode.CREW_NAME_TAKEN, "이미 쓰는 크루 이름이다");
    }
    if (request.photoMediaId() != null) {
      request.photoMediaId().ifPresent(mediaId -> mediaService.requireOwnedBy(mediaId, me));
    }
    crew.update(
        name, request.intro(), request.photoMediaId(), request.goalCount(), clock.instant());
    return view(crew, me);
  }

  @Transactional(readOnly = true)
  public CrewPreviewResponse preview(String inviteCode) {
    Crew crew =
        crewRepository
            .findByInviteCodeAndDeletedAtIsNull(InviteCodes.canonical(inviteCode))
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "없는 초대 코드다"));
    return new CrewPreviewResponse(
        crew.getId().toString(),
        crew.getName(),
        crewRepository.countMembers(crew.getId()),
        photoUrl(crew.getPhotoMediaId()),
        crew.getIntro(),
        brief(crew.getLeaderId()));
  }

  @Transactional
  public InviteCodeResponse reissueInviteCode(CrewMembership membership) {
    membership.requireLeader();
    Instant now = clock.instant();
    for (int attempt = 0; attempt < INVITE_CODE_ATTEMPTS; attempt++) {
      String code = InviteCodes.issue();
      if (crewRepository.changeInviteCodeIfFree(membership.crewId(), code, now) == 1) {
        return new InviteCodeResponse(code);
      }
    }
    throw new IllegalStateException("초대 코드가 계속 겹친다 — 코드 공간을 늘릴 때다");
  }

  private void insertCrew(UUID crewId, String name, UUID leaderId, Instant now) {
    for (int attempt = 0; attempt < INVITE_CODE_ATTEMPTS; attempt++) {
      if (crewRepository.existsByName(name)) {
        throw new BusinessException(ErrorCode.CREW_NAME_TAKEN, "이미 쓰는 크루 이름이다");
      }
      if (crewRepository.insertIfAbsent(crewId, name, leaderId, InviteCodes.issue(), now) == 1) {
        return;
      }
    }
    throw new IllegalStateException("초대 코드가 계속 겹친다 — 코드 공간을 늘릴 때다");
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
        crewRepository.countMembers(crew.getId()),
        crew.getGoalCount(),
        crew.getInviteCode(),
        leader ? crewRepository.countPendingJoinRequests(crew.getId()) : 0,
        null,
        0,
        leader);
  }

  public UserBriefResponse brief(UUID userId) {
    UserBriefRow user = crewQueryRepository.findUserBrief(userId);
    if ("DELETED".equals(user.getStatus())) {
      return new UserBriefResponse(user.getId().toString(), WITHDRAWN_NICKNAME, null, true);
    }
    return new UserBriefResponse(
        user.getId().toString(),
        Objects.requireNonNullElse(user.getNickname(), ""),
        photoUrl(user.getPhotoMediaId()),
        false);
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
