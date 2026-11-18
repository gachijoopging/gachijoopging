package site.gachijoopging.server.domain.crew.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.support.IntegrationTest;

class CrewServiceAdmitTest extends IntegrationTest {

  @Autowired private CrewService crewService;
  @Autowired private TransactionTemplate transactionTemplate;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private DataSource dataSource;

  @Test
  void 잠그지_않은_트랜잭션에서_불러도_정원을_넘지_않는다() throws Exception {
    UUID 크루 = 크루원이_찬_크루(CrewService.CAPACITY - 1);
    UUID 신입 = 사람();
    UUID 쉰째 = 사람();
    ExecutorService 손 = Executors.newSingleThreadExecutor();
    try (Connection 다른_가입 = dataSource.getConnection()) {
      다른_가입.setAutoCommit(false);
      try (PreparedStatement 잠금 =
          다른_가입.prepareStatement("SELECT 1 FROM crews WHERE id = ? FOR UPDATE")) {
        잠금.setObject(1, 크루);
        잠금.executeQuery();
      }
      try (PreparedStatement 넣는다 =
          다른_가입.prepareStatement(
              "INSERT INTO crew_members (crew_id, user_id, joined_at) VALUES (?, ?, now())")) {
        넣는다.setObject(1, 크루);
        넣는다.setObject(2, 쉰째);
        넣는다.executeUpdate();
      }
      Future<?> 가입 =
          손.submit(
              () ->
                  transactionTemplate.executeWithoutResult(
                      status -> crewService.admit(크루, 신입, Instant.now())));
      잠금을_기다릴_때까지_본다();
      다른_가입.commit();

      ExecutionException 실패 = null;
      try {
        가입.get(10, TimeUnit.SECONDS);
      } catch (ExecutionException e) {
        실패 = e;
      }
      assertThat(실패).isNotNull();
      assertThat(실패.getCause())
          .isInstanceOfSatisfying(
              BusinessException.class,
              e -> assertThat(e.errorCode()).isEqualTo(ErrorCode.CREW_FULL));
    } finally {
      손.shutdown();
    }
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM crew_members WHERE crew_id = ?", Integer.class, 크루))
        .isEqualTo(CrewService.CAPACITY);
  }

  private UUID 크루원이_찬_크루(int 명) {
    UUID 크루 = UUID.randomUUID();
    UUID 크루장 = 사람();
    jdbcTemplate.update(
        "INSERT INTO crews (id, name, intro, leader_id, region, join_policy, created_at, updated_at)"
            + " VALUES (?, ?, '', ?, 'SEOUL', 'OPEN', now(), now())",
        크루,
        "크루" + 크루.toString().substring(0, 8),
        크루장);
    jdbcTemplate.update(
        "INSERT INTO crew_members (crew_id, user_id, joined_at) VALUES (?, ?, now())", 크루, 크루장);
    for (int i = 1; i < 명; i++) {
      jdbcTemplate.update(
          "INSERT INTO crew_members (crew_id, user_id, joined_at) VALUES (?, ?, now())", 크루, 사람());
    }
    return 크루;
  }

  private UUID 사람() {
    UUID 사람 = UUID.randomUUID();
    jdbcTemplate.update("INSERT INTO users (id, updated_at) VALUES (?, now())", 사람);
    return 사람;
  }

  private void 잠금을_기다릴_때까지_본다() throws InterruptedException {
    for (int i = 0; i < 100; i++) {
      Integer 대기 =
          jdbcTemplate.queryForObject(
              "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'",
              Integer.class);
      if (대기 > 0) {
        return;
      }
      Thread.sleep(50);
    }
    throw new AssertionError("가입이 크루 행 잠금을 기다리지 않는다");
  }
}
