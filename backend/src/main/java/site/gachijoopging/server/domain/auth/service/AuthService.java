package site.gachijoopging.server.domain.auth.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.activity.service.ActivityService;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.TokenPairResponse;
import site.gachijoopging.server.domain.auth.entity.RefreshToken;
import site.gachijoopging.server.domain.auth.repository.RefreshTokenRepository;
import site.gachijoopging.server.domain.user.dto.UserAccount;
import site.gachijoopging.server.domain.user.service.UserService;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.lock.UserLock;
import site.gachijoopging.server.global.metrics.GachijoopgingMetrics;
import site.gachijoopging.server.global.security.jwt.JwtIssuer;

@Service
@Transactional(readOnly = true)
public class AuthService {

  private static final Duration REFRESH_TOKEN_TTL = Duration.ofDays(30);

  private final RefreshTokenRepository refreshTokenRepository;
  private final RefreshTokenFamilyRevoker familyRevoker;
  private final UserService userService;
  private final ActivityService activityService;
  private final UserLock userLock;
  private final JwtIssuer jwtIssuer;
  private final Clock clock;

  private final Counter loginAttempt;

  private final Counter loginFailure;

  public AuthService(
      RefreshTokenRepository refreshTokenRepository,
      RefreshTokenFamilyRevoker familyRevoker,
      UserService userService,
      ActivityService activityService,
      UserLock userLock,
      JwtIssuer jwtIssuer,
      Clock clock,
      MeterRegistry meterRegistry) {
    this.refreshTokenRepository = refreshTokenRepository;
    this.familyRevoker = familyRevoker;
    this.userService = userService;
    this.activityService = activityService;
    this.userLock = userLock;
    this.jwtIssuer = jwtIssuer;
    this.clock = clock;
    this.loginAttempt = meterRegistry.counter(GachijoopgingMetrics.LOGIN_ATTEMPT);
    this.loginFailure = meterRegistry.counter(GachijoopgingMetrics.LOGIN_FAILURE);
  }

  @Transactional
  public TokenPairResponse signup(String email, String password, String nickname) {
    return newSession(userService.create(email, password, nickname));
  }

  @Transactional
  public TokenPairResponse login(String email, String password) {
    loginAttempt.increment();
    UserAccount account =
        userService
            .authenticate(email, password)
            .orElseThrow(
                () -> {
                  loginFailure.increment();
                  return new BusinessException(ErrorCode.INVALID_CREDENTIALS, "이메일 또는 비밀번호가 다르다");
                });
    return newSession(account);
  }

  @Transactional
  public TokenPairResponse kakaoSession(String kakaoId, String nickname) {
    return newSession(userService.findOrCreateByKakaoId(kakaoId, nickname));
  }

  @Transactional
  public TokenPairResponse googleSession(String googleSub, String nickname) {
    return newSession(userService.findOrCreateByGoogleSub(googleSub, nickname));
  }

  @Transactional
  public TokenPairResponse refresh(String rawToken) {
    RefreshToken stored =
        refreshTokenRepository
            .findByTokenHash(OpaqueToken.hash(rawToken))
            .orElseThrow(() -> reject("모르는 refreshToken"));

    Instant now = clock.instant();

    if (stored.revoked()) {
      familyRevoker.revokeFamily(stored.getFamilyId(), now);
      throw reject("이미 회전된 refreshToken 이 다시 왔다 — 탈취로 본다");
    }
    if (stored.expiredAt(now)) {
      throw reject("만료된 refreshToken");
    }

    userService.requireUsable(stored.getUserId());

    if (userService.sessionVersionOf(stored.getUserId()).orElseThrow()
        != stored.getSessionVersion()) {
      throw reject("비밀번호 재설정 전에 발급된 refreshToken");
    }

    if (refreshTokenRepository.revokeIfActive(stored.getTokenHash(), now) == 0) {
      throw reject("이미 회전 중인 refreshToken 이다 — 다른 요청이 먼저 가져갔다");
    }

    return new TokenPairResponse(
        jwtIssuer.issue(stored.getUserId()),
        issueRefreshToken(stored.getUserId(), stored.getFamilyId(), stored.getSessionVersion()),
        false);
  }

  @Transactional
  public void logout(String rawToken) {
    if (rawToken == null || rawToken.isBlank()) {
      return;
    }
    refreshTokenRepository
        .findByTokenHash(OpaqueToken.hash(rawToken))
        .ifPresent(
            token -> {
              // 로그아웃하면 진행 중 활동을 이어받을 기기가 없어진다. 활동 시작과 같은 잠금으로 엇갈림을 막는다
              userLock.lock(token.getUserId());
              if (activityService.hasInProgress(token.getUserId())) {
                throw new BusinessException(ErrorCode.CONFLICT, "진행 중인 활동을 끝낸 뒤 로그아웃할 수 있다");
              }
              token.revoke(clock.instant());
            });
  }

  @Transactional
  public void revokeAllSessions(UUID userId) {
    refreshTokenRepository.revokeAllByUserId(userId, clock.instant());
  }

  private TokenPairResponse newSession(UserAccount account) {
    return new TokenPairResponse(
        jwtIssuer.issue(account.id()),
        issueRefreshToken(account.id(), UUID.randomUUID(), account.sessionVersion()),
        account.isNew());
  }

  // 버전은 다시 읽지 않고 비밀번호를 확인한 시점의 것을 싣는다 — 그 사이 재설정이 끝났으면 이 토큰은 거부돼야 한다
  private String issueRefreshToken(UUID userId, UUID familyId, int sessionVersion) {
    Instant now = clock.instant();
    String rawToken = OpaqueToken.newToken();
    refreshTokenRepository.save(
        RefreshToken.builder()
            .userId(userId)
            .tokenHash(OpaqueToken.hash(rawToken))
            .familyId(familyId)
            .expiresAt(now.plus(REFRESH_TOKEN_TTL))
            .sessionVersion(sessionVersion)
            .now(now)
            .build());
    return rawToken;
  }

  private static BusinessException reject(String reason) {
    return new BusinessException(ErrorCode.TOKEN_EXPIRED, "refreshToken 거부 — " + reason);
  }
}
