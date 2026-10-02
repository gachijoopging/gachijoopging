package site.gachijoopging.server;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import site.gachijoopging.server.support.IntegrationTest;

class FlywayMigrationTest extends IntegrationTest {

  @Autowired private JdbcTemplate jdbc;

  @Test
  void 빈_DB_에_V1_이_성공으로_적용된다() {
    List<Map<String, Object>> 이력 =
        jdbc.queryForList("SELECT version, success FROM flyway_schema_history WHERE version = '1'");

    assertThat(이력).singleElement().satisfies(행 -> assertThat(행.get("success")).isEqualTo(true));
  }
}
