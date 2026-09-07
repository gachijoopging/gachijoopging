package site.gachijoopging.server.domain.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import site.gachijoopging.server.support.IntegrationTest;

@AutoConfigureMockMvc
class AuthSignupLoginTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;

  @Test
  void 가입하면_세션이_돌아온다() throws Exception {
    mockMvc
        .perform(자격증명("signup@test.io", "password123"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
        .andExpect(jsonPath("$.data.refreshToken").isNotEmpty())
        .andExpect(jsonPath("$.data.user.email").value("signup@test.io"));
  }

  @Test
  void 가입_직후에는_온보딩이_필요하다() throws Exception {
    mockMvc
        .perform(자격증명("onboarding@test.io", "password123"))
        .andExpect(jsonPath("$.data.onboardingRequired").value(true));
  }

  @Test
  void 중복_이메일은_409_CONFLICT_다() throws Exception {
    mockMvc.perform(자격증명("dup@test.io", "password123")).andExpect(status().isOk());

    mockMvc
        .perform(자격증명("dup@test.io", "password123"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONFLICT"));
  }

  @Test
  void 비밀번호_8자_미만은_422_VALIDATION_이다() throws Exception {
    mockMvc
        .perform(자격증명("short@test.io", "1234567"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION"));
  }

  @Test
  void 비밀번호는_평문으로_저장되지_않는다() throws Exception {
    mockMvc.perform(자격증명("hash@test.io", "password123")).andExpect(status().isOk());

    String 저장된_해시 =
        jdbcTemplate.queryForObject(
            "SELECT password_hash FROM users WHERE email = 'hash@test.io'", String.class);

    assertThat(저장된_해시).isNotNull().isNotEqualTo("password123").startsWith("$2");
  }

  @Test
  void 로그인하면_세션이_돌아온다() throws Exception {
    mockMvc.perform(자격증명("login@test.io", "password123")).andExpect(status().isOk());

    mockMvc
        .perform(
            post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(본문("login@test.io", "password123")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
        .andExpect(jsonPath("$.data.user.email").value("login@test.io"));
  }

  @Test
  void 없는_계정과_틀린_비밀번호는_같은_401_INVALID_CREDENTIALS_다() throws Exception {
    mockMvc.perform(자격증명("real@test.io", "password123")).andExpect(status().isOk());

    mockMvc
        .perform(
            post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(본문("real@test.io", "wrong-password")))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));

    mockMvc
        .perform(
            post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(본문("nobody@test.io", "password123")))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
  }

  @Test
  void 가입은_refresh_token_을_한_줄_남긴다() throws Exception {
    mockMvc.perform(자격증명("token-row@test.io", "password123")).andExpect(status().isOk());

    Integer 행수 =
        jdbcTemplate.queryForObject(
            """
            SELECT count(*) FROM refresh_tokens t
            JOIN users u ON u.id = t.user_id
            WHERE u.email = 'token-row@test.io' AND t.revoked_at IS NULL
            """,
            Integer.class);

    assertThat(행수).isEqualTo(1);
  }

  private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder 자격증명(
      String 이메일, String 비밀번호) {
    return post("/api/v1/auth/signup")
        .contentType(MediaType.APPLICATION_JSON)
        .content(본문(이메일, 비밀번호));
  }

  private static String 본문(String 이메일, String 비밀번호) {
    return "{\"email\":\"%s\",\"password\":\"%s\"}".formatted(이메일, 비밀번호);
  }
}
