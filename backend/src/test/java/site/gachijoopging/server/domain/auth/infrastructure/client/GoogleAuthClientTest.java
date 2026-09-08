package site.gachijoopging.server.domain.auth.infrastructure.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.auth0.jwk.Jwk;
import com.auth0.jwk.JwkException;
import com.auth0.jwk.JwkProvider;
import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Map;
import org.junit.jupiter.api.Test;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

class GoogleAuthClientTest {

  private static final String 우리_클라이언트 = "our-client-id.apps.googleusercontent.com";
  private static final String KID = "test-kid";
  private static final String 구글_발급자 = "https://accounts.google.com";

  private static final Instant 지금 = Instant.parse("2026-08-05T00:00:00Z");

  private static final KeyPair 구글_키 = 새_키쌍();
  private static final KeyPair 남의_키 = 새_키쌍();

  private GoogleAuthClient 클라이언트(String clientId) {
    return new GoogleAuthClient(
        jwks(KID, (RSAPublicKey) 구글_키.getPublic()),
        new GoogleAuthProperties(clientId, "https://example.invalid/certs", Duration.ofSeconds(3)),
        Clock.fixed(지금, ZoneOffset.UTC));
  }

  @Test
  void 정상_토큰은_sub_를_돌려준다() {
    String token = 토큰(구글_키, KID, 구글_발급자, 우리_클라이언트, 지금.plusSeconds(600));

    assertThat(클라이언트(우리_클라이언트).verify(token)).isEqualTo("google-sub-123");
  }

  @Test
  void 접두사_없는_발급자도_받는다() {
    String token = 토큰(구글_키, KID, "accounts.google.com", 우리_클라이언트, 지금.plusSeconds(600));

    assertThat(클라이언트(우리_클라이언트).verify(token)).isEqualTo("google-sub-123");
  }

  @Test
  void 다른_클라이언트_ID_로_발급된_토큰은_거부한다() {
    String token =
        토큰(구글_키, KID, 구글_발급자, "someone-else.apps.googleusercontent.com", 지금.plusSeconds(600));

    거부됨(() -> 클라이언트(우리_클라이언트).verify(token));
  }

  @Test
  void 발급자가_없으면_거부한다() {
    String token = 토큰(구글_키, KID, null, 우리_클라이언트, 지금.plusSeconds(600));

    거부됨(() -> 클라이언트(우리_클라이언트).verify(token));
  }

  @Test
  void 대상이_없으면_거부한다() {
    String token = 토큰(구글_키, KID, 구글_발급자, null, 지금.plusSeconds(600));

    거부됨(() -> 클라이언트(우리_클라이언트).verify(token));
  }

  @Test
  void 발급자가_구글이_아니면_거부한다() {
    String token = 토큰(구글_키, KID, "https://evil.example", 우리_클라이언트, 지금.plusSeconds(600));

    거부됨(() -> 클라이언트(우리_클라이언트).verify(token));
  }

  @Test
  void 만료된_토큰은_거부한다() {
    String token = 토큰(구글_키, KID, 구글_발급자, 우리_클라이언트, 지금.minusSeconds(1));

    거부됨(() -> 클라이언트(우리_클라이언트).verify(token));
  }

  @Test
  void 서명이_맞지_않으면_거부한다() {
    String token = 토큰(남의_키, KID, 구글_발급자, 우리_클라이언트, 지금.plusSeconds(600));

    거부됨(() -> 클라이언트(우리_클라이언트).verify(token));
  }

  @Test
  void kid_가_없으면_거부한다() {
    String token = 토큰(구글_키, null, 구글_발급자, 우리_클라이언트, 지금.plusSeconds(600));

    거부됨(() -> 클라이언트(우리_클라이언트).verify(token));
  }

  @Test
  void JWKS_에_없는_kid_는_거부한다() {
    String token = 토큰(구글_키, "모르는-kid", 구글_발급자, 우리_클라이언트, 지금.plusSeconds(600));

    거부됨(() -> 클라이언트(우리_클라이언트).verify(token));
  }

  @Test
  void RS256_이_아니면_거부한다() {
    String token =
        JWT.create()
            .withKeyId(KID)
            .withIssuer(구글_발급자)
            .withAudience(우리_클라이언트)
            .withSubject("google-sub-123")
            .withExpiresAt(지금.plusSeconds(600))
            .sign(Algorithm.HMAC256("아무-비밀"));

    거부됨(() -> 클라이언트(우리_클라이언트).verify(token));
  }

  @Test
  void 설정이_없으면_거부한다() {
    String token = 토큰(구글_키, KID, 구글_발급자, 우리_클라이언트, 지금.plusSeconds(600));

    assertThatThrownBy(() -> 클라이언트("").verify(token))
        .isInstanceOf(BusinessException.class)
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.INTERNAL);
  }

  @Test
  void JWT_형식이_아니면_거부한다() {
    거부됨(() -> 클라이언트(우리_클라이언트).verify("이건-토큰이-아니다"));
  }

  private static void 거부됨(ThrowableAssertRunnable 실행) {
    assertThatThrownBy(실행::run)
        .isInstanceOf(BusinessException.class)
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.INVALID_CREDENTIALS);
  }

  private interface ThrowableAssertRunnable {
    void run();
  }

  private static String 토큰(KeyPair 서명키, String kid, String iss, String aud, Instant expiresAt) {
    var builder = JWT.create().withSubject("google-sub-123").withExpiresAt(expiresAt);
    if (kid != null) {
      builder.withKeyId(kid);
    }
    if (iss != null) {
      builder.withIssuer(iss);
    }
    if (aud != null) {
      builder.withAudience(aud);
    }
    return builder.sign(
        Algorithm.RSA256((RSAPublicKey) 서명키.getPublic(), (RSAPrivateKey) 서명키.getPrivate()));
  }

  private static JwkProvider jwks(String kid, RSAPublicKey publicKey) {
    Jwk jwk =
        Jwk.fromValues(
            Map.of(
                "kty",
                "RSA",
                "kid",
                kid,
                "alg",
                "RS256",
                "use",
                "sig",
                "n",
                base64url(publicKey.getModulus().toByteArray()),
                "e",
                base64url(publicKey.getPublicExponent().toByteArray())));
    return keyId -> {
      if (!kid.equals(keyId)) {
        throw new NoSuchKid(keyId);
      }
      return jwk;
    };
  }

  private static class NoSuchKid extends JwkException {
    NoSuchKid(String keyId) {
      super("그런 kid 가 없다: " + keyId);
    }
  }

  private static String base64url(byte[] bytes) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private static KeyPair 새_키쌍() {
    try {
      KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
      generator.initialize(2048);
      return generator.generateKeyPair();
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("테스트 키 생성 실패", e);
    }
  }
}
