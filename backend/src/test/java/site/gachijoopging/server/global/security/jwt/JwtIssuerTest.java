package site.gachijoopging.server.global.security.jwt;

import static org.assertj.core.api.Assertions.assertThat;

import com.auth0.jwt.JWT;
import com.auth0.jwt.interfaces.DecodedJWT;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class JwtIssuerTest {

  private static final Instant 지금 = Instant.parse("2026-08-04T00:00:00Z");

  private JwtIssuer issuer;

  @BeforeEach
  void setUp() {
    JwtKeyFixture 키 = JwtKeyFixture.새_키쌍();
    JwtProperties properties =
        new JwtProperties(
            "active-1", 키.privateKeyPem(), 키.publicKeyPem(), null, null, Duration.ofHours(1));
    issuer = new JwtIssuer(properties, Clock.fixed(지금, ZoneOffset.UTC));
  }

  @Test
  void sub_는_사용자_id_다() {
    UUID 사용자 = UUID.randomUUID();

    DecodedJWT 토큰 = JWT.decode(issuer.issue(사용자));

    assertThat(토큰.getSubject()).isEqualTo(사용자.toString());
  }

  @Test
  void 헤더에_active_kid_가_실린다() {
    DecodedJWT 토큰 = JWT.decode(issuer.issue(UUID.randomUUID()));

    assertThat(토큰.getKeyId()).isEqualTo("active-1");
  }

  @Test
  void 알고리즘은_RS256_이다() {
    DecodedJWT 토큰 = JWT.decode(issuer.issue(UUID.randomUUID()));

    assertThat(토큰.getAlgorithm()).isEqualTo("RS256");
  }

  @Test
  void 만료는_발급_한_시간_뒤다() {
    DecodedJWT 토큰 = JWT.decode(issuer.issue(UUID.randomUUID()));

    assertThat(토큰.getExpiresAtAsInstant()).isEqualTo(지금.plus(Duration.ofHours(1)));
  }

  @Test
  void 역할은_토큰에_담기지_않는다() {
    DecodedJWT 토큰 = JWT.decode(issuer.issue(UUID.randomUUID()));

    assertThat(토큰.getClaim("role").isMissing()).isTrue();
    assertThat(토큰.getClaim("authorities").isMissing()).isTrue();
  }
}
