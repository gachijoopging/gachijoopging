package site.gachijoopging.server.domain.user.service;

import java.time.Clock;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.activity.service.ActivityService;
import site.gachijoopging.server.domain.crew.service.CrewMemberService;
import site.gachijoopging.server.domain.media.entity.MediaPurpose;
import site.gachijoopging.server.domain.media.service.MediaService;
import site.gachijoopging.server.domain.media.service.MediaSignedUrl;
import site.gachijoopging.server.domain.notification.service.NotificationService;
import site.gachijoopging.server.domain.safety.service.BlockService;
import site.gachijoopging.server.domain.user.dto.DeviceRequest;
import site.gachijoopging.server.domain.user.dto.MeResponse;
import site.gachijoopging.server.domain.user.dto.MeUpdateRequest;
import site.gachijoopging.server.domain.user.dto.UserAccount;
import site.gachijoopging.server.domain.user.entity.User;
import site.gachijoopging.server.domain.user.event.UserWithdrawnEvent;
import site.gachijoopging.server.domain.user.repository.UserQueryRepository;
import site.gachijoopging.server.domain.user.repository.UserRepository;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.lock.UserLock;
import site.gachijoopging.server.global.security.AccountAuthorityLoader;
import site.gachijoopging.server.global.security.SessionVersionLoader;

@Service
@RequiredArgsConstructor
public class UserService implements AccountAuthorityLoader, SessionVersionLoader {

  private static final List<GrantedAuthority> USER =
      List.of(new SimpleGrantedAuthority("ROLE_USER"));

  private final UserRepository userRepository;
  private final UserQueryRepository userQueryRepository;
  private final PasswordEncoder passwordEncoder;
  private final MediaService mediaService;
  private final MediaSignedUrl mediaSignedUrl;
  private final ActivityService activityService;
  private final CrewMemberService crewMemberService;
  private final BlockService blockService;
  private final NotificationService notificationService;
  private final UserLock userLock;
  private final ApplicationEventPublisher events;
  private final Clock clock;

  @Transactional
  public UserAccount create(String email, String password, String nickname) {
    UUID id = UUID.randomUUID();
    int inserted =
        userRepository.insertEmailIfAbsent(
            id, email, passwordEncoder.encode(password), nickname, clock.instant());
    if (inserted == 0) {
      throw userRepository.existsByEmail(email)
          ? new BusinessException(ErrorCode.EMAIL_TAKEN, "이미 가입된 이메일이다")
          : nicknameTaken();
    }
    return new UserAccount(id, true, 0);
  }

  @Transactional(readOnly = true)
  public Optional<UserAccount> authenticate(String email, String password) {
    return userRepository
        .findByEmail(email)
        .filter(User::active)
        .filter(user -> user.getPasswordHash() != null)
        .filter(user -> passwordEncoder.matches(password, user.getPasswordHash()))
        .map(UserService::account);
  }

  @Transactional
  public UserAccount findOrCreateByKakaoId(String kakaoId, String nickname) {
    return findOrCreateSocial(
        nickname,
        nick ->
            userRepository.insertKakaoIfAbsent(UUID.randomUUID(), kakaoId, nick, clock.instant()),
        () -> userRepository.findByKakaoId(kakaoId));
  }

  @Transactional
  public UserAccount findOrCreateByGoogleSub(String googleSub, String nickname) {
    return findOrCreateSocial(
        nickname,
        nick ->
            userRepository.insertGoogleIfAbsent(
                UUID.randomUUID(), googleSub, nick, clock.instant()),
        () -> userRepository.findByGoogleSub(googleSub));
  }

  // ON CONFLICT 에 대상이 없어 0행만으로는 어느 제약에 걸렸는지 모른다. 닉네임이 겹쳐도 가입은 막지 않고
  // 계약대로 닉네임 없이 만들어 profileComplete=false 로 닉네임 화면에서 이어가게 한다
  private UserAccount findOrCreateSocial(
      String nickname, Function<String, Integer> insert, Supplier<Optional<User>> find) {
    boolean created =
        insert.apply(nickname) == 1
            || (nickname != null && find.get().isEmpty() && insert.apply(null) == 1);
    return find.get()
        .filter(User::active)
        .map(user -> new UserAccount(user.getId(), created, user.getSessionVersion()))
        .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_CREDENTIALS, "쓸 수 없는 계정이다"));
  }

  @Transactional
  public void linkKakao(UUID userId, String kakaoId) {
    User me = activeUser(userId);
    if (kakaoId.equals(me.getKakaoId())) {
      return;
    }
    if (me.getKakaoId() != null || userRepository.findByKakaoId(kakaoId).isPresent()) {
      throw new BusinessException(ErrorCode.CONFLICT, "이미 다른 카카오 계정이 연결돼 있다");
    }
    me.linkKakao(kakaoId, clock.instant());
  }

  @Transactional
  public void linkGoogle(UUID userId, String googleSub) {
    User me = activeUser(userId);
    if (googleSub.equals(me.getGoogleSub())) {
      return;
    }
    if (me.getGoogleSub() != null || userRepository.findByGoogleSub(googleSub).isPresent()) {
      throw new BusinessException(ErrorCode.CONFLICT, "이미 다른 구글 계정이 연결돼 있다");
    }
    me.linkGoogle(googleSub, clock.instant());
  }

  @Transactional(readOnly = true)
  public void requireUsable(UUID userId) {
    activeUser(userId);
  }

  @Transactional(readOnly = true)
  public MeResponse getMe(UUID userId) {
    User me = activeUser(userId);
    return new MeResponse(
        me.getId().toString(),
        me.profileComplete(),
        me.getNickname(),
        me.getIntro(),
        photoUrl(me.getPhotoMediaId()),
        me.getEmail(),
        me.getPasswordHash() != null,
        new MeResponse.Linked(me.getKakaoId() != null, me.getGoogleSub() != null),
        new MeResponse.Settings(me.isShareLocationDefault(), me.isNotifyActivityStart()),
        membership(userId));
  }

  private MeResponse.Membership membership(UUID userId) {
    return userQueryRepository
        .findMembership(userId)
        .map(
            row ->
                new MeResponse.Membership(
                    MeResponse.MembershipStatus.MEMBER,
                    new MeResponse.MembershipCrew(
                        row.getCrewId().toString(),
                        row.getCrewName(),
                        row.getLeaderId().equals(userId)),
                    null))
        .or(() -> pendingMembership(userId))
        .orElseGet(
            () ->
                new MeResponse.Membership(
                    MeResponse.MembershipStatus.NONE, null, unreadRejection(userId)));
  }

  private MeResponse.Rejection unreadRejection(UUID userId) {
    return userQueryRepository
        .findUnreadRejection(userId)
        .map(
            row ->
                new MeResponse.Rejection(
                    row.getRequestId().toString(),
                    new MeResponse.RejectionCrew(row.getCrewId().toString(), row.getCrewName()),
                    row.getDecidedAt()))
        .orElse(null);
  }

  private Optional<MeResponse.Membership> pendingMembership(UUID userId) {
    return userQueryRepository
        .findPendingCrew(userId)
        .map(
            row ->
                new MeResponse.Membership(
                    MeResponse.MembershipStatus.PENDING,
                    new MeResponse.MembershipCrew(
                        row.getCrewId().toString(), row.getCrewName(), false),
                    null));
  }

  @Transactional
  public MeResponse updateMe(UUID userId, MeUpdateRequest request) {
    User me = activeUser(userId);
    if (request.nickname() != null
        && userRepository.existsByNicknameAndIdNot(request.nickname(), userId)) {
      throw new BusinessException(ErrorCode.NICKNAME_TAKEN, "이미 쓰는 닉네임이다");
    }
    if (request.photoMediaId() != null) {
      request
          .photoMediaId()
          .ifPresent(mediaId -> mediaService.requireOwnedBy(mediaId, userId, MediaPurpose.PROFILE));
    }
    me.updateProfile(
        request.nickname(),
        request.intro(),
        request.photoMediaId(),
        request.shareLocationDefault(),
        request.notifyActivityStart(),
        clock.instant());
    return getMe(userId);
  }

  @Transactional
  public void registerDevice(UUID userId, DeviceRequest request) {
    userLock.lock(userId);
    userRepository.upsertDevice(
        request.pushToken(), userId, request.platform().name(), clock.instant());
  }

  @Transactional
  public void follow(UUID me, UUID userId) {
    userRepository.followIfSameCrew(me, userId, clock.instant());
  }

  @Transactional
  public void unfollow(UUID me, UUID userId) {
    userRepository.unfollow(me, userId);
  }

  // 활동 시작·크루 가입·나가기와 같은 사용자 잠금으로 줄 세운다. 순서가 있다 — 활동 사진 행이 지워져야
  // media 행을 지울 수 있고, 엔티티는 일괄 쿼리(이벤트 리스너 것 포함)가 영속성 컨텍스트를 비운 뒤에 읽어야
  // 수정이 버려지지 않는다
  @Transactional
  public void withdraw(UUID me) {
    userLock.lock(me);
    activityService.withdraw(me);
    crewMemberService.withdraw(me);
    mediaService.withdraw(me);
    userRepository.deleteDevicesOf(me);
    userRepository.deleteFollowsOf(me);
    blockService.withdraw(me);
    notificationService.withdraw(me);
    events.publishEvent(new UserWithdrawnEvent(me));
    activeUser(me).withdraw(clock.instant());
  }

  @Transactional(readOnly = true)
  public Optional<UUID> findPasswordOwnerId(String email) {
    return userRepository
        .findByEmail(email)
        .filter(User::active)
        .filter(user -> user.getPasswordHash() != null)
        .map(User::getId);
  }

  @Transactional
  public void changePassword(UUID userId, String newPassword) {
    activeUser(userId).changePassword(passwordEncoder.encode(newPassword), clock.instant());
  }

  @Override
  @Transactional(readOnly = true)
  public Collection<? extends GrantedAuthority> authoritiesOf(UUID userId) {
    activeUser(userId);
    return USER;
  }

  // 비밀번호를 재설정하면 모든 기기의 세션을 끊는다 (docs/openapi.yaml §password-reset/confirm)
  @Override
  @Transactional(readOnly = true)
  public Optional<Integer> sessionVersionOf(UUID userId) {
    return userRepository.findById(userId).map(User::getSessionVersion);
  }

  private User activeUser(UUID userId) {
    return userRepository
        .findById(userId)
        .filter(User::active)
        .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_CREDENTIALS, "쓸 수 없는 계정이다"));
  }

  private static UserAccount account(User user) {
    return new UserAccount(user.getId(), false, user.getSessionVersion());
  }

  private static BusinessException nicknameTaken() {
    return new BusinessException(ErrorCode.NICKNAME_TAKEN, "이미 쓰는 닉네임이다");
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
}
