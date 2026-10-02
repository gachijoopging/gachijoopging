package site.gachijoopging.server.domain.user.domain.service;

import java.time.Clock;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.media.domain.policy.MediaSignedUrl;
import site.gachijoopging.server.domain.media.domain.service.MediaService;
import site.gachijoopging.server.domain.user.domain.entity.User;
import site.gachijoopging.server.domain.user.dto.MeResponse;
import site.gachijoopging.server.domain.user.dto.MeUpdateRequest;
import site.gachijoopging.server.domain.user.dto.UserAccount;
import site.gachijoopging.server.domain.user.infrastructure.persistence.UserRepository;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.security.AccountAuthorityLoader;

@Service
@RequiredArgsConstructor
public class UserService implements AccountAuthorityLoader {

  private static final List<GrantedAuthority> USER = List.of(new SimpleGrantedAuthority("ROLE_USER"));

  private final UserRepository userRepository;
  private final PasswordEncoder passwordEncoder;
  private final MediaService mediaService;
  private final MediaSignedUrl mediaSignedUrl;
  private final Clock clock;

  @Transactional
  public UserAccount create(String email, String password) {
    UUID id = UUID.randomUUID();
    int inserted =
        userRepository.insertEmailIfAbsent(id, email, passwordEncoder.encode(password), clock.instant());
    if (inserted == 0) {
      throw new BusinessException(ErrorCode.CONFLICT, "이미 가입된 이메일이다");
    }
    return new UserAccount(id, true);
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
  public UserAccount findOrCreateByKakaoId(String kakaoId) {
    userRepository.insertKakaoIfAbsent(UUID.randomUUID(), kakaoId, clock.instant());
    return usable(userRepository.findByKakaoId(kakaoId));
  }

  @Transactional
  public UserAccount findOrCreateByGoogleSub(String googleSub) {
    userRepository.insertGoogleIfAbsent(UUID.randomUUID(), googleSub, clock.instant());
    return usable(userRepository.findByGoogleSub(googleSub));
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
        new MeResponse.Membership(MeResponse.MembershipStatus.NONE, null));
  }

  @Transactional
  public MeResponse updateMe(UUID userId, MeUpdateRequest request) {
    User me = activeUser(userId);
    if (request.nickname() != null
        && userRepository.existsByNicknameAndIdNot(request.nickname(), userId)) {
      throw new BusinessException(ErrorCode.NICKNAME_TAKEN, "이미 쓰는 닉네임이다");
    }
    if (request.photoMediaId() != null) {
      request.photoMediaId().ifPresent(mediaId -> mediaService.requireOwnedBy(mediaId, userId));
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

  private User activeUser(UUID userId) {
    return userRepository
        .findById(userId)
        .filter(User::active)
        .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_CREDENTIALS, "쓸 수 없는 계정이다"));
  }

  private static UserAccount usable(Optional<User> user) {
    return user.filter(User::active)
        .map(UserService::account)
        .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_CREDENTIALS, "쓸 수 없는 계정이다"));
  }

  private static UserAccount account(User user) {
    return new UserAccount(user.getId(), !user.profileComplete());
  }

  private String photoUrl(UUID photoMediaId) {
    if (photoMediaId == null) {
      return null;
    }
    return mediaService.find(photoMediaId).map(media -> mediaSignedUrl.of(media.objectKey())).orElse(null);
  }
}
