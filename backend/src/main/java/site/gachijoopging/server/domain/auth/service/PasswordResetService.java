package site.gachijoopging.server.domain.auth.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.auth.entity.PasswordResetToken;
import site.gachijoopging.server.domain.auth.repository.PasswordResetTokenRepository;
import site.gachijoopging.server.domain.user.service.UserService;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PasswordResetService {

  private static final SecureRandom RANDOM = new SecureRandom();

  private final PasswordResetTokenRepository tokenRepository;
  private final UserService userService;
  private final AuthService authService;
  private final PasswordResetProperties properties;
  private final Clock clock;

  @Transactional
  public Optional<String> issue(String email) {
    return userService.findPasswordOwnerId(email).map(this::issueFor);
  }

  // 틀린 횟수는 실패 응답과 함께 남아야 한다 — 예외로 롤백되지 않게 결과를 돌려주고 호출자가 422 를 던진다
  @Transactional
  public boolean confirm(String email, String code, String newPassword) {
    Instant now = clock.instant();
    Optional<UUID> owner = userService.findPasswordOwnerId(email);
    if (owner.isEmpty()) {
      return false;
    }
    UUID userId = owner.get();
    Optional<PasswordResetToken> token =
        tokenRepository.findFirstByUserIdAndUsedAtIsNullAndExpiresAtAfterOrderByIdDesc(userId, now);
    if (token.isEmpty()) {
      return false;
    }
    if (!matches(token.get().getTokenHash(), hash(userId, code))) {
      tokenRepository.recordFailure(token.get().getId(), properties.maxAttempts(), now);
      return false;
    }
    if (tokenRepository.consume(token.get().getId(), now) == 0) {
      return false;
    }
    userService.changePassword(userId, newPassword);
    authService.revokeAllSessions(userId);
    return true;
  }

  private String issueFor(UUID userId) {
    Instant now = clock.instant();
    tokenRepository.expireUnusedByUserId(userId, now);
    String code = "%06d".formatted(RANDOM.nextInt(1_000_000));
    tokenRepository.save(
        PasswordResetToken.builder()
            .userId(userId)
            .tokenHash(hash(userId, code))
            .expiresAt(now.plus(properties.codeTtl()))
            .now(now)
            .build());
    return code;
  }

  private static String hash(UUID userId, String code) {
    return OpaqueToken.hash(userId + ":" + code);
  }

  private static boolean matches(String stored, String candidate) {
    return MessageDigest.isEqual(
        stored.getBytes(StandardCharsets.UTF_8), candidate.getBytes(StandardCharsets.UTF_8));
  }
}
