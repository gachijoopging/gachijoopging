package site.gachijoopging.server.domain.auth.client;

import com.auth0.jwk.Jwk;
import com.auth0.jwk.JwkProvider;
import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import com.auth0.jwt.interfaces.DecodedJWT;
import java.security.interfaces.RSAPublicKey;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

@Component
@Slf4j
public class GoogleAuthClient {

  private static final String REQUIRED_ALGORITHM = "RS256";

  private static final Set<String> GOOGLE_ISSUERS =
      Set.of("accounts.google.com", "https://accounts.google.com");

  private final JwkProvider jwkProvider;
  private final GoogleAuthProperties properties;
  private final Clock clock;

  public GoogleAuthClient(
      JwkProvider googleJwkProvider, GoogleAuthProperties properties, Clock clock) {
    this.jwkProvider = googleJwkProvider;
    this.properties = properties;
    this.clock = clock;
  }

  public String verify(String idToken) {
    if (!properties.configured()) {
      log.error("구글 클라이언트 ID 가 없다 (app.google-auth.client-id) — 구글 로그인을 거부한다");
      throw new BusinessException(ErrorCode.INTERNAL, "구글 클라이언트 ID 가 설정되지 않았다");
    }

    DecodedJWT decoded = decode(idToken);

    if (!REQUIRED_ALGORITHM.equals(decoded.getAlgorithm())) {
      throw reject("alg 가 " + REQUIRED_ALGORITHM + " 이 아니다: " + decoded.getAlgorithm());
    }

    String kid = decoded.getKeyId();
    if (kid == null) {
      throw reject("kid 가 없다");
    }

    verifySignature(decoded, publicKey(kid));

    String issuer = decoded.getIssuer();
    if (issuer == null || !GOOGLE_ISSUERS.contains(issuer)) {
      throw reject("iss 가 구글이 아니다: " + issuer);
    }

    List<String> audience = decoded.getAudience();
    if (audience == null || !audience.contains(properties.clientId())) {
      log.warn("aud 가 우리 클라이언트가 아니다 — 받은 {}", audience);
      throw reject("우리에게 발급된 토큰이 아니다");
    }

    Instant expiresAt = decoded.getExpiresAtAsInstant();
    if (expiresAt == null || !expiresAt.isAfter(clock.instant())) {
      throw reject("만료됐다");
    }

    String sub = decoded.getSubject();
    if (sub == null || sub.isBlank()) {
      throw reject("sub 가 없다");
    }
    return sub;
  }

  private DecodedJWT decode(String idToken) {
    try {
      return JWT.decode(idToken);
    } catch (RuntimeException e) {
      throw reject("JWT 형식이 아니다");
    }
  }

  private RSAPublicKey publicKey(String kid) {
    try {
      Jwk jwk = jwkProvider.get(kid);
      return (RSAPublicKey) jwk.getPublicKey();
    } catch (Exception e) {
      log.warn("구글 공개키를 찾지 못했다 — kid {}: {}", kid, e.toString());
      throw reject("모르는 kid: " + kid);
    }
  }

  private void verifySignature(DecodedJWT decoded, RSAPublicKey publicKey) {
    try {
      Algorithm.RSA256(publicKey, null).verify(decoded);
    } catch (RuntimeException e) {
      throw reject("서명이 맞지 않는다");
    }
  }

  private static BusinessException reject(String reason) {
    return new BusinessException(ErrorCode.INVALID_CREDENTIALS, "구글 idToken 거부 — " + reason);
  }
}
