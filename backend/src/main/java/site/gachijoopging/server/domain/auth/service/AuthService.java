package site.gachijoopging.server.domain.auth.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.SessionResponse;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.TokenPairResponse;
import site.gachijoopging.server.domain.auth.entity.RefreshToken;
import site.gachijoopging.server.domain.auth.repository.RefreshTokenRepository;
import site.gachijoopging.server.domain.user.dto.UserAccount;
import site.gachijoopging.server.domain.user.service.UserService;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.metrics.GachijoopgingMetrics;
import site.gachijoopging.server.global.security.jwt.JwtIssuer;

@Service
@Transactional(readOnly = true)
public class AuthService {

  private static final Duration REFRESH_TOKEN_TTL = Duration.ofDays(30);

  private final RefreshTokenRepository refreshTokenRepository;
  private final RefreshTokenFamilyRevoker familyRevoker;
  private final UserService userService;
  private final JwtIssuer jwtIssuer;
  private final Clock clock;

  private final Counter loginAttempt;

  private final Counter loginFailure;

  public AuthService(
      RefreshTokenRepository refreshTokenRepository,
      RefreshTokenFamilyRevoker familyRevoker,
      UserService userService,
      JwtIssuer jwtIssuer,
      Clock clock,
      MeterRegistry meterRegistry) {
    this.refreshTokenRepository = refreshTokenRepository;
    this.familyRevoker = familyRevoker;
    this.userService = userService;
    this.jwtIssuer = jwtIssuer;
    this.clock = clock;
    this.loginAttempt = meterRegistry.counter(GachijoopgingMetrics.LOGIN_ATTEMPT);
    this.loginFailure = meterRegistry.counter(GachijoopgingMetrics.LOGIN_FAILURE);
  }

  @Transactional
  public SessionResponse signup(String email, String password) {
    UserAccount account = userService.create(email, password);
    return session(account, issueRefreshToken(account.id(), UUID.randomUUID()));
  }

  @Transactional
  public SessionResponse login(String email, String password) {
    loginAttempt.increment();
    UserAccount account =
        userService
            .authenticate(email, password)
            .orElseThrow(
                () -> {
                  loginFailure.increment();
                  return new BusinessException(ErrorCode.INVALID_CREDENTIALS, "이메일 또는 비밀번호가 다르다");
                });

    return session(account, issueRefreshToken(account.id(), UUID.randomUUID()));
  }

  @Transactional
  public SessionResponse kakaoSession(String kakaoId) {
    return socialSession(userService.findOrCreateByKakaoId(kakaoId));
  }

  @Transactional
  public SessionResponse googleSession(String googleSub) {
    return socialSession(userService.findOrCreateByGoogleSub(googleSub));
  }

  private SessionResponse socialSession(UserAccount account) {
    return session(account, issueRefreshToken(account.id(), UUID.randomUUID()));
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

    if (refreshTokenRepository.revokeIfActive(stored.getTokenHash(), now) == 0) {
      throw reject("이미 회전 중인 refreshToken 이다 — 다른 요청이 먼저 가져갔다");
    }

    String accessToken = jwtIssuer.issue(stored.getUserId());
    String refreshToken = issueRefreshToken(stored.getUserId(), stored.getFamilyId());
    return new TokenPairResponse(accessToken, refreshToken);
  }

  @Transactional
  public void logout(String rawToken) {
    if (rawToken == null || rawToken.isBlank()) {
      return;
    }
    refreshTokenRepository
        .findByTokenHash(OpaqueToken.hash(rawToken))
        .ifPresent(token -> token.revoke(clock.instant()));
  }

  @Transactional
  public void revokeAllSessions(UUID userId) {
    refreshTokenRepository.revokeAllByUserId(userId, clock.instant());
  }

  private String issueRefreshToken(UUID userId, UUID familyId) {
    Instant now = clock.instant();
    String rawToken = OpaqueToken.newToken();
    refreshTokenRepository.save(
        RefreshToken.builder()
            .userId(userId)
            .tokenHash(OpaqueToken.hash(rawToken))
            .familyId(familyId)
            .expiresAt(now.plus(REFRESH_TOKEN_TTL))
            .now(now)
            .build());
    return rawToken;
  }

  private SessionResponse session(UserAccount account, String refreshToken) {
    return new SessionResponse(
        jwtIssuer.issue(account.id()),
        refreshToken,
        account.onboardingRequired(),
        userService.getMe(account.id()));
  }

  private static BusinessException reject(String reason) {
    return new BusinessException(ErrorCode.TOKEN_EXPIRED, "refreshToken 거부 — " + reason);
  }
}
