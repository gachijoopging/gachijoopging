package site.gachijoopging.server.domain.safety;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import site.gachijoopging.server.domain.safety.service.ReportCleanupJob;
import site.gachijoopging.server.support.IntegrationTest;

class ReportCleanupJobTest extends IntegrationTest {

  private static final Duration 보존 = Duration.ofDays(364);

  @Autowired private ReportCleanupJob reportCleanupJob;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private Clock clock;

  @Test
  void 처리된_지_기준을_넘은_신고는_지운다() {
    UUID 신고 = 신고를_만든다("report-cleanup-old", clock.instant().minus(보존).minusSeconds(60));

    reportCleanupJob.removeResolvedReports();

    assertThat(남아_있나(신고)).isFalse();
  }

  @Test
  void 처리된_지_기준이_안_된_신고는_남긴다() {
    UUID 신고 = 신고를_만든다("report-cleanup-recent", clock.instant().minus(보존).plusSeconds(60));

    reportCleanupJob.removeResolvedReports();

    assertThat(남아_있나(신고)).isTrue();
  }

  @Test
  void 대기_중인_신고는_오래돼도_남긴다() {
    UUID 신고 = 신고를_만든다("report-cleanup-pending", null);
    jdbcTemplate.update(
        "UPDATE reports SET created_at = now() - interval '2 years' WHERE id = ?", 신고);

    reportCleanupJob.removeResolvedReports();

    assertThat(남아_있나(신고)).isTrue();
  }

  private boolean 남아_있나(UUID 신고) {
    return jdbcTemplate.queryForObject(
            "SELECT count(*) FROM reports WHERE id = ?", Integer.class, 신고)
        > 0;
  }

  private UUID 신고를_만든다(String 이름, Instant 처리) {
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
    return jdbcTemplate.queryForObject(
        """
        INSERT INTO reports (id, crew_id, reporter_id, target_type, target_id, reason,
                             status, result, resolved_by, resolved_at)
        VALUES (gen_random_uuid(), ?, ?, 'USER', ?, 'SPAM', ?, ?, ?, ?) RETURNING id
        """,
        UUID.class,
        크루,
        사용자,
        UUID.randomUUID().toString(),
        처리 == null ? "PENDING" : "RESOLVED",
        처리 == null ? null : "DISMISS",
        처리 == null ? null : 사용자,
        처리 == null ? null : Timestamp.from(처리));
  }
}
