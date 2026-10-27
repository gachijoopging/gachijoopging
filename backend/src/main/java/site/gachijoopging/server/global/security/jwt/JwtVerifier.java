package site.gachijoopging.server.global.security.jwt;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.interfaces.DecodedJWT;
import java.security.interfaces.RSAPublicKey;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.security.SessionCutoffLoader;

@Component
public class JwtVerifier {

  private static final String REQUIRED_ALGORITHM = "RS256";

  private final Map<String, RSAPublicKey> publicKeysByKid;
  private final Clock clock;
  private final SessionCutoffLoader sessionCutoffLoader;

  public JwtVerifier(
      JwtProperties properties, Clock clock, SessionCutoffLoader sessionCutoffLoader) {
    this.publicKeysByKid = publicKeysByKid(properties);
    this.clock = clock;
    this.sessionCutoffLoader = sessionCutoffLoader;
  }

  public UUID verify(String token) {
    DecodedJWT decoded = decode(token);

    if (!REQUIRED_ALGORITHM.equals(decoded.getAlgorithm())) {
      throw reject("alg 가 " + REQUIRED_ALGORITHM + " 이 아니다: " + decoded.getAlgorithm());
    }

    String kid = decoded.getKeyId();
    if (kid == null) {
      throw reject("kid 가 없다");
    }

    RSAPublicKey publicKey = publicKeysByKid.get(kid);
    if (publicKey == null) {
      throw reject("모르는 kid: " + kid);
    }

    try {
      Algorithm.RSA256(publicKey, null).verify(decoded);
    } catch (RuntimeException e) {
      throw reject("서명이 맞지 않는다");
    }

    Instant expiresAt = decoded.getExpiresAtAsInstant();
    if (expiresAt == null || !expiresAt.isAfter(clock.instant())) {
      throw reject("만료됐다");
    }

    UUID userId = subject(decoded);
    if (issuedBeforeCutoff(decoded, userId)) {
      throw reject("세션이 끊기기 전에 발급됐다");
    }
    return userId;
  }

  // iat 는 초 단위다. 기준도 초로 잘라야 끊은 그 초 안에 새로 받은 토큰이 통한다
  private boolean issuedBeforeCutoff(DecodedJWT decoded, UUID userId) {
    Instant issuedAt = decoded.getIssuedAtAsInstant();
    return sessionCutoffLoader
        .sessionCutoffOf(userId)
        .map(cutoff -> cutoff.truncatedTo(ChronoUnit.SECONDS))
        .filter(cutoff -> issuedAt == null || issuedAt.isBefore(cutoff))
        .isPresent();
  }

  private DecodedJWT decode(String token) {
    try {
      return JWT.decode(token);
    } catch (RuntimeException e) {
      throw reject("JWT 형식이 아니다");
    }
  }

  private UUID subject(DecodedJWT decoded) {
    try {
      return UUID.fromString(decoded.getSubject());
    } catch (RuntimeException e) {
      throw reject("sub 가 사용자 id 가 아니다");
    }
  }

  private static Map<String, RSAPublicKey> publicKeysByKid(JwtProperties properties) {
    Map<String, RSAPublicKey> keys = new HashMap<>();
    keys.put(properties.activeKid(), RsaPem.publicKey(properties.publicKeyPem()));

    boolean hasKid = StringUtils.hasText(properties.previousKid());
    boolean hasPem = StringUtils.hasText(properties.previousPublicKeyPem());
    if (hasKid != hasPem) {
      throw new IllegalStateException(
          "PREVIOUS 는 짝이어야 한다 — JWT_PREVIOUS_KID 와 JWT_PREVIOUS_PUBLIC_KEY_PEM 을 함께 주거나 함께 비운다");
    }
    if (hasKid) {
      keys.put(properties.previousKid(), RsaPem.publicKey(properties.previousPublicKeyPem()));
    }
    return Map.copyOf(keys);
  }

  private static BusinessException reject(String reason) {
    return new BusinessException(ErrorCode.TOKEN_EXPIRED, "accessToken 거부 — " + reason);
  }
}
