package site.gachijoopging.server.domain.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts;

@AutoConfigureMockMvc
class AuthSignupLoginTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;

  @Test
  void 가입하면_201_과_새_토큰_쌍이_돌아온다() throws Exception {
    mockMvc
        .perform(가입("signup@test.io", "password123", TestAccounts.고유_닉네임()))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
        .andExpect(jsonPath("$.data.refreshToken").isNotEmpty())
        .andExpect(jsonPath("$.data.isNew").value(true))
        .andExpect(jsonPath("$.data.user").doesNotExist());
  }

  @Test
  void 중복_이메일은_409_EMAIL_TAKEN_이다() throws Exception {
    mockMvc
        .perform(가입("dup@test.io", "password123", TestAccounts.고유_닉네임()))
        .andExpect(status().isCreated());

    mockMvc
        .perform(가입("dup@test.io", "password123", TestAccounts.고유_닉네임()))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("EMAIL_TAKEN"));
  }

  @Test
  void 중복_닉네임은_409_NICKNAME_TAKEN_이고_계정을_만들지_않는다() throws Exception {
    String 닉네임 = TestAccounts.고유_닉네임();
    mockMvc.perform(가입("nick-a@test.io", "password123", 닉네임)).andExpect(status().isCreated());

    mockMvc
        .perform(가입("nick-b@test.io", "password123", 닉네임))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("NICKNAME_TAKEN"));

    assertThat(회원수("nick-b@test.io")).isZero();
  }

  @Test
  void 닉네임은_앞뒤_공백과_줄바꿈을_정리해_저장한다() throws Exception {
    mockMvc
        .perform(가입("trim@test.io", "password123", "  줍깅\\n러  "))
        .andExpect(status().isCreated());

    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT nickname FROM users WHERE email = 'trim@test.io'", String.class))
        .isEqualTo("줍깅러");
  }

  @Test
  void 정리하고_2자_미만인_닉네임은_422_VALIDATION_이다() throws Exception {
    mockMvc
        .perform(가입("short-nick@test.io", "password123", "  가  "))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION"));
  }

  @Test
  void 닉네임_길이는_글자_수로_센다() throws Exception {
    mockMvc
        .perform(가입("emoji-short@test.io", "password123", "😀"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION"));
    mockMvc
        .perform(가입("emoji-ok@test.io", "password123", "😀".repeat(12)))
        .andExpect(status().isCreated());
  }

  @Test
  void 닉네임_없는_가입은_422_VALIDATION_이다() throws Exception {
    mockMvc
        .perform(
            post("/api/v1/auth/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"no-nick@test.io\",\"password\":\"password123\"}"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION"));
  }

  @Test
  void 비밀번호_8자_미만은_422_VALIDATION_이다() throws Exception {
    mockMvc
        .perform(가입("short@test.io", "1234567", TestAccounts.고유_닉네임()))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION"));
  }

  @Test
  void 비밀번호는_평문으로_저장되지_않는다() throws Exception {
    mockMvc
        .perform(가입("hash@test.io", "password123", TestAccounts.고유_닉네임()))
        .andExpect(status().isCreated());

    String 저장된_해시 =
        jdbcTemplate.queryForObject(
            "SELECT password_hash FROM users WHERE email = 'hash@test.io'", String.class);

    assertThat(저장된_해시).isNotNull().isNotEqualTo("password123").startsWith("$2");
  }

  @Test
  void 가입은_refresh_token_을_한_줄_남긴다() throws Exception {
    mockMvc
        .perform(가입("token-row@test.io", "password123", TestAccounts.고유_닉네임()))
        .andExpect(status().isCreated());

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

  @Test
  void 로그인하면_토큰_쌍이_돌아오고_새_계정이_아니다() throws Exception {
    mockMvc
        .perform(가입("login@test.io", "password123", TestAccounts.고유_닉네임()))
        .andExpect(status().isCreated());

    mockMvc
        .perform(로그인("login@test.io", "password123"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
        .andExpect(jsonPath("$.data.refreshToken").isNotEmpty())
        .andExpect(jsonPath("$.data.isNew").value(false));
  }

  @Test
  void 없는_계정과_틀린_비밀번호는_같은_401_INVALID_CREDENTIALS_다() throws Exception {
    mockMvc
        .perform(가입("real@test.io", "password123", TestAccounts.고유_닉네임()))
        .andExpect(status().isCreated());

    mockMvc
        .perform(로그인("real@test.io", "wrong-password"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));

    mockMvc
        .perform(로그인("nobody@test.io", "password123"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
  }

  @Test
  void 로그인은_형식이_틀려도_422_가_아니라_401_이다() throws Exception {
    mockMvc
        .perform(로그인("이메일-아님", "짧음"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
  }

  @Test
  void 같은_이메일로_로그인이_잦으면_429_RATE_LIMITED_와_Retry_After_다() throws Exception {
    for (int i = 0; i < 10; i++) {
      mockMvc
          .perform(로그인("throttle-login@test.io", "wrong").header("X-Real-IP", "10.9.9.9"))
          .andExpect(status().isUnauthorized());
    }

    mockMvc
        .perform(로그인("throttle-login@test.io", "wrong").header("X-Real-IP", "10.9.9.9"))
        .andExpect(status().isTooManyRequests())
        .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
        .andExpect(header().exists(HttpHeaders.RETRY_AFTER));
  }

  private Integer 회원수(String 이메일) {
    return jdbcTemplate.queryForObject(
        "SELECT count(*) FROM users WHERE email = ?", Integer.class, 이메일);
  }

  private static MockHttpServletRequestBuilder 가입(String 이메일, String 비밀번호, String 닉네임) {
    return post("/api/v1/auth/signup")
        .contentType(MediaType.APPLICATION_JSON)
        .content(
            "{\"email\":\"%s\",\"password\":\"%s\",\"nickname\":\"%s\"}".formatted(이메일, 비밀번호, 닉네임));
  }

  private static MockHttpServletRequestBuilder 로그인(String 이메일, String 비밀번호) {
    return post("/api/v1/auth/login")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(이메일, 비밀번호));
  }
}
