package site.gachijoopging.server.domain.auth.domain.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import site.gachijoopging.server.support.IntegrationTest;

class RefreshTokenCleanupJobTest extends IntegrationTest {

  @Autowired private RefreshTokenCleanupJob refreshTokenCleanupJob;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private Clock clock;

  @Test
  void 만료_후_30일이_지난_토큰을_지운다() {
    UUID 사용자 = 사용자를_만든다("refresh-cleanup-old@test.io");
    String 해시 = 토큰을_만든다(사용자, clock.instant().minus(31, ChronoUnit.DAYS));

    refreshTokenCleanupJob.removeExpiredTokens();

    assertThat(남아_있나(해시)).isFalse();
  }

  @Test
  void 만료된_지_얼마_안_된_토큰은_남긴다() {
    UUID 사용자 = 사용자를_만든다("refresh-cleanup-recent@test.io");
    String 해시 = 토큰을_만든다(사용자, clock.instant().minus(29, ChronoUnit.DAYS));

    refreshTokenCleanupJob.removeExpiredTokens();

    assertThat(남아_있나(해시)).isTrue();
  }

  @Test
  void 아직_만료되지_않은_토큰은_건드리지_않는다() {
    UUID 사용자 = 사용자를_만든다("refresh-cleanup-alive@test.io");
    String 해시 = 토큰을_만든다(사용자, clock.instant().plus(14, ChronoUnit.DAYS));

    refreshTokenCleanupJob.removeExpiredTokens();

    assertThat(남아_있나(해시)).isTrue();
  }

  private boolean 남아_있나(String 해시) {
    Integer 개수 =
        jdbcTemplate.queryForObject(
            "SELECT count(*) FROM refresh_tokens WHERE token_hash = ?", Integer.class, 해시);
    return 개수 != null && 개수 > 0;
  }

  private String 토큰을_만든다(UUID 사용자, Instant 만료) {
    String 해시 = UUID.randomUUID().toString();
    jdbcTemplate.update(
        """
        INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
        VALUES (?, ?, ?, ?)
        """,
        사용자,
        해시,
        UUID.randomUUID(),
        java.sql.Timestamp.from(만료));
    return 해시;
  }

  private UUID 사용자를_만든다(String 이메일) {
    return jdbcTemplate.queryForObject(
        "INSERT INTO users (email, nickname) VALUES (?, ?) RETURNING id",
        UUID.class,
        이메일,
        이메일.substring(0, 이메일.indexOf('@')));
  }
}
