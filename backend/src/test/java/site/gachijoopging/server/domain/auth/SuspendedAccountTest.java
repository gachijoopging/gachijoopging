package site.gachijoopging.server.domain.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts;

@AutoConfigureMockMvc
class SuspendedAccountTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;

  @Test
  void 정지되면_이미_발급된_accessToken_이_다음_요청부터_막힌다() throws Exception {
    var 계정 = TestAccounts.가입한다(mockMvc, "suspended-token@test.io");
    정지시킨다("suspended-token@test.io", "규정 위반으로 정지된 계정이다");

    mockMvc
        .perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, 계정.bearer()))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCOUNT_SUSPENDED"))
        .andExpect(jsonPath("$.message").value("규정 위반으로 정지된 계정이다"));
  }

  @Test
  void 정지되면_재로그인이_403_이다() throws Exception {
    TestAccounts.가입한다(mockMvc, "suspended-login@test.io");
    정지시킨다("suspended-login@test.io", "규정 위반으로 정지된 계정이다");

    mockMvc
        .perform(
            post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"suspended-login@test.io\",\"password\":\"password123\"}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCOUNT_SUSPENDED"));
  }

  @Test
  void 정지되면_refresh_회전이_403_이다() throws Exception {
    String refreshToken = 가입하고_refreshToken을_받는다("suspended-refresh@test.io");
    정지시킨다("suspended-refresh@test.io", "규정 위반으로 정지된 계정이다");

    mockMvc
        .perform(
            post("/api/v1/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"%s\"}".formatted(refreshToken)))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCOUNT_SUSPENDED"));
  }

  @Test
  void 정지_안내가_비어_있어도_보여줄_문구가_나간다() throws Exception {
    var 계정 = TestAccounts.가입한다(mockMvc, "suspended-nomsg@test.io");
    정지시킨다("suspended-nomsg@test.io", null);

    mockMvc
        .perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, 계정.bearer()))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCOUNT_SUSPENDED"))
        .andExpect(jsonPath("$.message").isNotEmpty());
  }

  @Test
  void 정지되어도_logout_은_통하고_refreshToken_이_실제로_끊긴다() throws Exception {
    String 응답 = 가입_응답("suspended-logout@test.io");
    String accessToken = JsonPath.read(응답, "$.data.accessToken");
    String refreshToken = JsonPath.read(응답, "$.data.refreshToken");
    정지시킨다("suspended-logout@test.io", "규정 위반으로 정지된 계정이다");

    mockMvc
        .perform(
            post("/api/v1/auth/logout")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"%s\"}".formatted(refreshToken)))
        .andExpect(status().isOk());

    assertThat(끊긴_토큰수("suspended-logout@test.io")).isEqualTo(1);
  }

  @Test
  void 개방_경로_예외가_refresh_회전까지_열어_주지는_않는다() throws Exception {
    String 응답 = 가입_응답("suspended-open@test.io");
    String accessToken = JsonPath.read(응답, "$.data.accessToken");
    String refreshToken = JsonPath.read(응답, "$.data.refreshToken");
    정지시킨다("suspended-open@test.io", "규정 위반으로 정지된 계정이다");

    mockMvc
        .perform(
            post("/api/v1/auth/refresh")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"%s\"}".formatted(refreshToken)))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCOUNT_SUSPENDED"));
  }

  @Test
  void 휴면_계정은_막지_않는다() throws Exception {
    var 계정 = TestAccounts.가입한다(mockMvc, "dormant@test.io");
    상태를_바꾼다("dormant@test.io", "DORMANT", null);

    mockMvc
        .perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, 계정.bearer()))
        .andExpect(status().isOk());
  }

  private void 정지시킨다(String 이메일, String 안내) {
    상태를_바꾼다(이메일, "SUSPENDED", 안내);
  }

  private void 상태를_바꾼다(String 이메일, String 상태, String 안내) {
    jdbcTemplate.update(
        "UPDATE users SET status = ?, suspend_message = ? WHERE email = ?", 상태, 안내, 이메일);
  }

  private Integer 끊긴_토큰수(String 이메일) {
    return jdbcTemplate.queryForObject(
        """
        SELECT count(*) FROM refresh_tokens t JOIN users u ON u.id = t.user_id
        WHERE u.email = ? AND t.revoked_at IS NOT NULL
        """,
        Integer.class,
        이메일);
  }

  private String 가입하고_refreshToken을_받는다(String 이메일) throws Exception {
    return JsonPath.read(가입_응답(이메일), "$.data.refreshToken");
  }

  private String 가입_응답(String 이메일) throws Exception {
    return mockMvc
        .perform(
            post("/api/v1/auth/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"password123\"}".formatted(이메일)))
        .andReturn()
        .getResponse()
        .getContentAsString();
  }
}
