package site.gachijoopging.server.domain.auth.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import site.gachijoopging.server.support.IntegrationTest;

class PasswordResetTokenCleanupJobTest extends IntegrationTest {

  @Autowired private PasswordResetTokenCleanupJob passwordResetTokenCleanupJob;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private Clock clock;

  @Test
  void 만료된_코드는_지운다() {
    Long 코드 =
        코드를_만든다("reset-cleanup-expired@test.io", clock.instant().minus(1, ChronoUnit.MINUTES));

    passwordResetTokenCleanupJob.removeExpiredTokens();

    assertThat(남아_있나(코드)).isFalse();
  }

  @Test
  void 아직_유효한_코드는_남긴다() {
    Long 코드 = 코드를_만든다("reset-cleanup-alive@test.io", clock.instant().plus(1, ChronoUnit.MINUTES));

    passwordResetTokenCleanupJob.removeExpiredTokens();

    assertThat(남아_있나(코드)).isTrue();
  }

  private boolean 남아_있나(Long 코드) {
    return jdbcTemplate.queryForObject(
            "SELECT count(*) FROM password_reset_tokens WHERE id = ?", Integer.class, 코드)
        > 0;
  }

  private Long 코드를_만든다(String 이메일, Instant 만료) {
    return jdbcTemplate.queryForObject(
        """
        WITH u AS (INSERT INTO users (id, email, updated_at) VALUES (gen_random_uuid(), ?, now())
                   RETURNING id)
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
        SELECT id, 'hash', ? FROM u RETURNING id
        """,
        Long.class,
        이메일,
        Timestamp.from(만료));
  }
}
