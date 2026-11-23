package site.gachijoopging.server.domain.live;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import site.gachijoopging.server.domain.live.repository.LiveLocationRepository;
import site.gachijoopging.server.domain.live.repository.LiveLocationRepository.StaleRow;
import site.gachijoopging.server.domain.live.service.LiveLocationCleanupJob;
import site.gachijoopging.server.support.IntegrationTest;

class LiveLocationCleanupJobTest extends IntegrationTest {

  private static final Duration 끊김 = Duration.ofMinutes(25);

  @Autowired private LiveLocationCleanupJob liveLocationCleanupJob;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private Clock clock;
  @Autowired private LiveLocationRepository liveLocationRepository;
  @Autowired private DataSource dataSource;

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

  // 배치 크기 1, 오래된 행 둘. 먼저 고를 행이 고르는 사이 갱신돼도 다음 후보를 지워야 한다
  @Test
  void 고른_후보가_동시에_갱신되면_다음_오래된_행을_지운다() throws Exception {
    liveLocationCleanupJob.removeStaleLocations();
    Instant 기준 = clock.instant().minus(끊김);
    UUID 되살아날_사용자 = 위치를_만든다("live-cleanup-race-a", 기준.minusSeconds(120));
    UUID 오래된_사용자 = 위치를_만든다("live-cleanup-race-b", 기준.minusSeconds(60));

    List<StaleRow> 지운_행;
    try (Connection 연결 = dataSource.getConnection()) {
      연결.setAutoCommit(false);
      try (PreparedStatement 문장 =
          연결.prepareStatement("UPDATE live_locations SET updated_at = now() WHERE user_id = ?")) {
        문장.setObject(1, 되살아날_사용자);
        문장.executeUpdate();
      }
      CompletableFuture<List<StaleRow>> 결과 =
          CompletableFuture.supplyAsync(() -> liveLocationRepository.deleteStale(기준, 1));
      Awaitility.await()
          .atMost(Duration.ofSeconds(10))
          .until(
              () ->
                  jdbcTemplate.queryForObject(
                          "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'",
                          Long.class)
                      > 0);
      연결.commit();
      지운_행 = 결과.get(10, TimeUnit.SECONDS);
    }

    assertThat(지운_행).extracting(StaleRow::userId).containsExactly(오래된_사용자);
    assertThat(남아_있나(되살아날_사용자)).isTrue();
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
