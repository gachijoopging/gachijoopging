package site.gachijoopging.server.domain.live;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import site.gachijoopging.server.domain.live.service.LiveLocationCleanupJob;
import site.gachijoopging.server.support.IntegrationTest;

class LiveLocationCleanupJobTest extends IntegrationTest {

  private static final Duration 끊김 = Duration.ofMinutes(25);

  @Autowired private LiveLocationCleanupJob liveLocationCleanupJob;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private Clock clock;

  @Test
  void 갱신이_기준보다_오래_끊긴_위치는_지운다() {
    UUID 사용자 = 위치를_만든다("live-cleanup-stale", clock.instant().minus(끊김).minusSeconds(60));

    liveLocationCleanupJob.removeStaleLocations();

    assertThat(남아_있나(사용자)).isFalse();
  }

  @Test
  void 기준_안에_갱신된_위치는_남긴다() {
    UUID 사용자 = 위치를_만든다("live-cleanup-fresh", clock.instant().minus(끊김).plusSeconds(60));

    liveLocationCleanupJob.removeStaleLocations();

    assertThat(남아_있나(사용자)).isTrue();
  }

  private boolean 남아_있나(UUID 사용자) {
    return jdbcTemplate.queryForObject(
            "SELECT count(*) FROM live_locations WHERE user_id = ?", Integer.class, 사용자)
        > 0;
  }

  private UUID 위치를_만든다(String 이름, Instant 갱신) {
    UUID 사용자 =
        jdbcTemplate.queryForObject(
            "INSERT INTO users (id, email, updated_at) VALUES (gen_random_uuid(), ?, now()) RETURNING id",
            UUID.class,
            이름 + "@test.io");
    UUID 크루 =
        jdbcTemplate.queryForObject(
            """
            INSERT INTO crews (id, name, leader_id, updated_at, region, join_policy)
            VALUES (gen_random_uuid(), ?, ?, now(), 'SEOUL', 'OPEN') RETURNING id
            """,
            UUID.class,
            이름,
            사용자);
    UUID 활동 = UUID.randomUUID();
    jdbcTemplate.update(
        """
        INSERT INTO activities (id, user_id, crew_id, status, started_at, location_shared)
        VALUES (?, ?, ?, 'IN_PROGRESS', now(), true)
        """,
        활동,
        사용자,
        크루);
    jdbcTemplate.update(
        "INSERT INTO live_locations (user_id, activity_id, crew_id, updated_at) VALUES (?, ?, ?, ?)",
        사용자,
        활동,
        크루,
        Timestamp.from(갱신));
    return 사용자;
  }
}
