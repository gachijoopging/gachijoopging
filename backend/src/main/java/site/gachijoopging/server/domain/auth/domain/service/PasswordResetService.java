package site.gachijoopging.server.domain.auth.domain.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.auth.domain.entity.PasswordResetToken;
import site.gachijoopging.server.domain.auth.domain.policy.OpaqueToken;
import site.gachijoopging.server.domain.auth.infrastructure.persistence.PasswordResetTokenRepository;
import site.gachijoopging.server.domain.user.domain.service.UserService;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.ratelimit.RateLimiter;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PasswordResetService {

  private static final Duration TOKEN_TTL = Duration.ofMinutes(30);

  private static final Duration PER_EMAIL_WINDOW = Duration.ofMinutes(10);
  private static final int PER_EMAIL_LIMIT = 1;
  private static final Duration PER_IP_WINDOW = Duration.ofHours(1);
  private static final int PER_IP_LIMIT = 10;

  private final PasswordResetTokenRepository tokenRepository;
  private final UserService userService;
  private final AuthService authService;
  private final PasswordResetMailSender mailSender;
  private final RateLimiter rateLimiter;
  private final Clock clock;

  @Transactional
  public void request(String email, String clientIp) {
    if (!withinLimits(email, clientIp)) {
      return;
    }

    Optional<UUID> owner = userService.findPasswordOwnerId(email);
    if (owner.isEmpty()) {
      return;
    }

    UUID userId = owner.get();
    Instant now = clock.instant();
    tokenRepository.expireUnusedByUserId(userId, now);

    String rawToken = OpaqueToken.newToken();
    tokenRepository.save(
        PasswordResetToken.builder()
            .userId(userId)
            .tokenHash(OpaqueToken.hash(rawToken))
            .expiresAt(now.plus(TOKEN_TTL))
            .now(now)
            .build());

    mailSender.send(email, rawToken);
  }

  @Transactional
  public void confirm(String rawToken, String newPassword) {
    Instant now = clock.instant();
    String tokenHash = OpaqueToken.hash(rawToken);

    if (tokenRepository.consume(tokenHash, now) == 0) {
      throw new BusinessException(ErrorCode.VALIDATION, "쓸 수 없는 재설정 토큰이다");
    }

    UUID userId =
        tokenRepository
            .findByTokenHash(tokenHash)
            .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION, "쓸 수 없는 재설정 토큰이다"))
            .getUserId();

    userService.changePassword(userId, newPassword);
    authService.revokeAllSessions(userId);
  }

  private boolean withinLimits(String email, String clientIp) {
    boolean emailOk =
        rateLimiter.tryAcquire(
            "pwreset:email:" + OpaqueToken.hash(email), PER_EMAIL_LIMIT, PER_EMAIL_WINDOW);
    boolean ipOk = rateLimiter.tryAcquire("pwreset:ip:" + clientIp, PER_IP_LIMIT, PER_IP_WINDOW);
    return emailOk && ipOk;
  }
}
