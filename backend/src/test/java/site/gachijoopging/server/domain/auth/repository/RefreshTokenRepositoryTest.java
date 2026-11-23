package site.gachijoopging.server.domain.auth.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.support.IntegrationTest;

@Transactional
class RefreshTokenRepositoryTest extends IntegrationTest {

  @Autowired private RefreshTokenRepository refreshTokenRepository;
  @Autowired private JdbcTemplate jdbc;

  @Test
  void 조건부_폐기는_한_번만_성공한다() {
    String 해시 = 살아있는_토큰을_만든다();
    Instant 지금 = Instant.parse("2026-08-05T00:00:00Z");

    assertThat(refreshTokenRepository.revokeIfActive(해시, 지금)).isEqualTo(1);
    assertThat(refreshTokenRepository.revokeIfActive(해시, 지금)).isZero();
  }

  @Test
  void 이미_폐기된_토큰의_폐기_시각은_덮어쓰이지_않는다() {
    String 해시 = 살아있는_토큰을_만든다();
    Instant 먼저 = Instant.parse("2026-08-05T00:00:00Z");
    Instant 나중 = Instant.parse("2026-08-05T00:00:01Z");

    refreshTokenRepository.revokeIfActive(해시, 먼저);
    refreshTokenRepository.revokeIfActive(해시, 나중);

    assertThat(폐기_시각(해시)).isEqualTo(먼저);
  }

  private String 살아있는_토큰을_만든다() {
    UUID 사용자 =
        jdbc.queryForObject(
            "INSERT INTO users (id, updated_at) VALUES (gen_random_uuid(), now()) RETURNING id",
            UUID.class);
    String 해시 = UUID.randomUUID().toString();
    jdbc.update(
        """
        INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
        VALUES (?, ?, ?, now() + interval '30 days')
        """,
        사용자,
        UUID.randomUUID(),
        해시);
    return 해시;
  }

  private Instant 폐기_시각(String 해시) {
    return jdbc.queryForObject(
        "SELECT revoked_at FROM refresh_tokens WHERE token_hash = ?", Instant.class, 해시);
  }
}
