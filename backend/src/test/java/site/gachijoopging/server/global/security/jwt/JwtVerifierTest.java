package site.gachijoopging.server.global.security.jwt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.security.SessionVersionLoader;

class JwtVerifierTest {

  private static final Instant 지금 = Instant.parse("2026-08-04T00:00:00Z");
  private static final Clock 고정시계 = Clock.fixed(지금, ZoneOffset.UTC);

  private static final SessionVersionLoader 끊긴_적_없음 = userId -> Optional.of(0);

  private final JwtKeyFixture active = JwtKeyFixture.새_키쌍();
  private final JwtKeyFixture previous = JwtKeyFixture.새_키쌍();

  @Test
  void 유효한_토큰은_사용자_id_로_풀린다() {
    UUID 사용자 = UUID.randomUUID();
    String 토큰 = issuer(active, "active-1").issue(사용자);

    assertThat(verifier().verify(토큰)).isEqualTo(사용자);
  }

  @Test
  void 만료된_토큰은_거부된다() {
    String 토큰 = issuer(active, "active-1").issue(UUID.randomUUID());
    JwtVerifier 한참_뒤 =
        new JwtVerifier(
            properties(), Clock.fixed(지금.plus(Duration.ofHours(2)), ZoneOffset.UTC), 끊긴_적_없음);

    assertThatThrownBy(() -> 한참_뒤.verify(토큰))
        .isInstanceOf(BusinessException.class)
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.TOKEN_EXPIRED);
  }

  @Test
  void PREVIOUS_키로_서명한_토큰도_검증된다() {
    UUID 사용자 = UUID.randomUUID();
    String 토큰 = issuer(previous, "previous-1").issue(사용자);

    assertThat(verifier().verify(토큰)).isEqualTo(사용자);
  }

  @Test
  void PREVIOUS_가_빈_문자열이면_회전_중이_아닌_것으로_본다() {
    JwtProperties 빈_previous =
        new JwtProperties(
            "active-1", active.privateKeyPem(), active.publicKeyPem(), "", "", Duration.ofHours(1));
    UUID 사용자 = UUID.randomUUID();

    UUID 결과 =
        new JwtVerifier(빈_previous, 고정시계, 끊긴_적_없음).verify(issuer(active, "active-1").issue(사용자));

    assertThat(결과).isEqualTo(사용자);
  }

  @Test
  void kid_가_없는_토큰은_거부된다() {
    String 토큰 =
        JWT.create()
            .withSubject(UUID.randomUUID().toString())
            .withExpiresAt(Date.from(지금.plus(Duration.ofHours(1))))
            .sign(Algorithm.RSA256(null, privateKey(active)));

    assertThatThrownBy(() -> verifier().verify(토큰)).isInstanceOf(BusinessException.class);
  }

  @Test
  void 모르는_kid_는_거부된다() {
    String 토큰 = issuer(active, "누가-봐도-없는-kid").issue(UUID.randomUUID());

    assertThatThrownBy(() -> verifier().verify(토큰)).isInstanceOf(BusinessException.class);
  }

  @Test
  void 등록되지_않은_키로_서명한_토큰은_거부된다() {
    JwtKeyFixture 남의_키 = JwtKeyFixture.새_키쌍();
    String 토큰 = issuer(남의_키, "active-1").issue(UUID.randomUUID());

    assertThatThrownBy(() -> verifier().verify(토큰)).isInstanceOf(BusinessException.class);
  }

  @Test
  void 서명이_없는_alg_none_토큰은_거부된다() {
    String 토큰 =
        JWT.create()
            .withKeyId("active-1")
            .withSubject(UUID.randomUUID().toString())
            .withExpiresAt(Date.from(지금.plus(Duration.ofHours(1))))
            .sign(Algorithm.none());

    assertThatThrownBy(() -> verifier().verify(토큰)).isInstanceOf(BusinessException.class);
  }

  @Test
  void 아무_문자열이나_거부된다() {
    assertThatThrownBy(() -> verifier().verify("not-a-jwt")).isInstanceOf(BusinessException.class);
  }

  @Test
  void 세션이_끊기기_전에_발급된_토큰은_같은_초여도_거부된다() {
    String 토큰 = issuer(active, "active-1").issue(UUID.randomUUID());
    JwtVerifier 끊은_뒤 = new JwtVerifier(properties(), 고정시계, userId -> Optional.of(1));

    assertThatThrownBy(() -> 끊은_뒤.verify(토큰))
        .isInstanceOf(BusinessException.class)
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.TOKEN_EXPIRED);
  }

  @Test
  void 세션을_끊은_뒤_발급된_토큰은_통한다() {
    UUID 사용자 = UUID.randomUUID();
    SessionVersionLoader 한_번_끊음 = userId -> Optional.of(1);
    String 토큰 = issuer(active, "active-1", 한_번_끊음).issue(사용자);

    assertThat(new JwtVerifier(properties(), 고정시계, 한_번_끊음).verify(토큰)).isEqualTo(사용자);
  }

  @Test
  void 세션_버전이_없는_토큰은_거부된다() {
    String 토큰 =
        JWT.create()
            .withKeyId("active-1")
            .withSubject(UUID.randomUUID().toString())
            .withIssuedAt(Date.from(지금))
            .withExpiresAt(Date.from(지금.plus(Duration.ofHours(1))))
            .sign(Algorithm.RSA256(null, privateKey(active)));

    assertThatThrownBy(() -> verifier().verify(토큰))
        .isInstanceOf(BusinessException.class)
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.TOKEN_EXPIRED);
  }

  private JwtVerifier verifier() {
    return new JwtVerifier(properties(), 고정시계, 끊긴_적_없음);
  }

  private JwtProperties properties() {
    return new JwtProperties(
        "active-1",
        active.privateKeyPem(),
        active.publicKeyPem(),
        "previous-1",
        previous.publicKeyPem(),
        Duration.ofHours(1));
  }

  private JwtIssuer issuer(JwtKeyFixture 키, String kid) {
    return issuer(키, kid, 끊긴_적_없음);
  }

  private JwtIssuer issuer(JwtKeyFixture 키, String kid, SessionVersionLoader 세션_버전) {
    return new JwtIssuer(
        new JwtProperties(
            kid, 키.privateKeyPem(), 키.publicKeyPem(), null, null, Duration.ofHours(1)),
        고정시계,
        세션_버전);
  }

  private static RSAPrivateKey privateKey(JwtKeyFixture 키) {
    try {
      String base64 =
          키.privateKeyPem()
              .replace("-----BEGIN PRIVATE KEY-----", "")
              .replace("-----END PRIVATE KEY-----", "")
              .replaceAll("\\s", "");
      return (RSAPrivateKey)
          KeyFactory.getInstance("RSA")
              .generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(base64)));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }
}
