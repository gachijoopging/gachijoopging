package site.gachijoopging.server.domain.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import site.gachijoopging.server.support.IntegrationTest;

@AutoConfigureMockMvc
class DailyActiveUserTest extends IntegrationTest {

  private static final ZoneId KST = ZoneId.of("Asia/Seoul");

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;

  @Test
  void 가입하면_오늘_접속으로_기록된다() throws Exception {
    UUID 사용자 = UUID.fromString(JsonPath.read(가입한다(), "$.data.user.id"));

    assertThat(오늘_행_수(사용자)).isEqualTo(1);
  }

  @Test
  void 같은_날_여러_번_갱신해도_한_행이다() throws Exception {
    String 응답 = 가입한다();
    UUID 사용자 = UUID.fromString(JsonPath.read(응답, "$.data.user.id"));
    String refresh = JsonPath.read(응답, "$.data.refreshToken");

    refresh = 갱신한다(refresh);
    갱신한다(refresh);

    assertThat(오늘_행_수(사용자)).isEqualTo(1);
  }

  @Test
  void 로그인해도_기록된다() throws Exception {
    String 이메일 = "dau-" + UUID.randomUUID() + "@auth.test";
    UUID 사용자 = UUID.fromString(JsonPath.read(가입한다(이메일), "$.data.user.id"));
    jdbcTemplate.update("DELETE FROM daily_active_users WHERE user_id = ?", 사용자);

    mockMvc
        .perform(
            post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"password123\"}".formatted(이메일)))
        .andExpect(status().isOk());

    assertThat(오늘_행_수(사용자)).isEqualTo(1);
  }

  private String 가입한다() throws Exception {
    return 가입한다("dau-" + UUID.randomUUID() + "@auth.test");
  }

  private String 가입한다(String 이메일) throws Exception {
    return mockMvc
        .perform(
            post("/api/v1/auth/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"password123\"}".formatted(이메일)))
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  private String 갱신한다(String refreshToken) throws Exception {
    String 응답 =
        mockMvc
            .perform(
                post("/api/v1/auth/refresh")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"refreshToken\":\"%s\"}".formatted(refreshToken)))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return JsonPath.read(응답, "$.data.refreshToken");
  }

  private long 오늘_행_수(UUID 사용자) {
    return jdbcTemplate.queryForObject(
        "SELECT count(*) FROM daily_active_users WHERE user_id = ? AND active_date = ?",
        Long.class,
        사용자,
        LocalDate.now(KST));
  }
}
