package site.gachijoopging.server.domain.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import site.gachijoopging.server.domain.auth.domain.policy.OpaqueToken;
import site.gachijoopging.server.support.IntegrationTest;

@AutoConfigureMockMvc
class PasswordResetTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private StringRedisTemplate redis;

  @BeforeEach
  void 제한을_비운다() {
    redis.getConnectionFactory().getConnection().serverCommands().flushDb();
  }

  @Test
  void 있는_계정도_없는_계정도_202_다() throws Exception {
    가입한다("reset-exists@test.io");

    mockMvc.perform(재설정요청("reset-exists@test.io")).andExpect(status().isAccepted());
    mockMvc.perform(재설정요청("nobody-here@test.io")).andExpect(status().isAccepted());
  }

  @Test
  void 있는_계정에는_재설정_토큰이_생긴다() throws Exception {
    가입한다("reset-token@test.io");

    mockMvc.perform(재설정요청("reset-token@test.io")).andExpect(status().isAccepted());

    assertThat(토큰수("reset-token@test.io")).isEqualTo(1);
  }

  @Test
  void 없는_계정에는_토큰이_생기지_않는다() throws Exception {
    Integer 요청_전 = 전체_토큰수();

    mockMvc.perform(재설정요청("ghost@test.io")).andExpect(status().isAccepted());

    assertThat(전체_토큰수()).isEqualTo(요청_전);
  }

  private Integer 전체_토큰수() {
    return jdbcTemplate.queryForObject("SELECT count(*) FROM password_reset_tokens", Integer.class);
  }

  @Test
  void 소셜_전용_계정에는_토큰이_생기지_않는다() throws Exception {
    jdbcTemplate.update(
        "INSERT INTO users (email, kakao_id, password_hash) VALUES ('social@test.io', 'kakao-1', NULL)");

    mockMvc.perform(재설정요청("social@test.io")).andExpect(status().isAccepted());

    assertThat(토큰수("social@test.io")).isZero();
  }

  @Test
  void 제한_창_안의_재요청은_202_지만_토큰이_늘지_않는다() throws Exception {
    가입한다("throttle@test.io");

    mockMvc.perform(재설정요청("throttle@test.io")).andExpect(status().isAccepted());
    mockMvc.perform(재설정요청("throttle@test.io")).andExpect(status().isAccepted());

    assertThat(토큰수("throttle@test.io")).isEqualTo(1);
  }

  @Test
  void 새_요청은_기존_미사용_토큰을_폐기한다() throws Exception {
    가입한다("reissue@test.io");
    mockMvc.perform(재설정요청("reissue@test.io")).andExpect(status().isAccepted());
    redis.getConnectionFactory().getConnection().serverCommands().flushDb();

    mockMvc.perform(재설정요청("reissue@test.io")).andExpect(status().isAccepted());

    Integer 살아있는_토큰 =
        jdbcTemplate.queryForObject(
            """
            SELECT count(*) FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
            WHERE u.email = 'reissue@test.io' AND t.used_at IS NULL AND t.expires_at > now()
            """,
            Integer.class);
    assertThat(살아있는_토큰).isEqualTo(1);
  }

  @Test
  void confirm_하면_새_비밀번호로_로그인된다() throws Exception {
    가입한다("confirm@test.io");
    String 원문 = 토큰을_발급받는다("confirm@test.io");

    mockMvc.perform(확인요청(원문, "newpassword123")).andExpect(status().isOk());

    mockMvc.perform(로그인("confirm@test.io", "newpassword123")).andExpect(status().isOk());
    mockMvc.perform(로그인("confirm@test.io", "password123")).andExpect(status().isUnauthorized());
  }

  @Test
  void confirm_은_토큰을_한_번만_받는다() throws Exception {
    가입한다("once@test.io");
    String 원문 = 토큰을_발급받는다("once@test.io");
    mockMvc.perform(확인요청(원문, "newpassword123")).andExpect(status().isOk());

    mockMvc.perform(확인요청(원문, "another-password")).andExpect(status().isUnprocessableEntity());
  }

  @Test
  void 모르는_토큰은_422_다() throws Exception {
    mockMvc.perform(확인요청("그런-토큰-없다", "newpassword123")).andExpect(status().isUnprocessableEntity());
  }

  @Test
  void 만료된_토큰은_422_다() throws Exception {
    가입한다("expired@test.io");
    String 원문 = 토큰을_발급받는다("expired@test.io");
    jdbcTemplate.update(
        "UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute' WHERE token_hash = ?",
        OpaqueToken.hash(원문));

    mockMvc.perform(확인요청(원문, "newpassword123")).andExpect(status().isUnprocessableEntity());
  }

  @Test
  void XFF_를_위조해도_IP_제한을_넘지_못한다() throws Exception {
    int 한도 = 10;
    for (int i = 0; i <= 한도; i++) {
      가입한다("xff-%d@test.io".formatted(i));
      mockMvc
          .perform(재설정요청("xff-%d@test.io".formatted(i)).header("X-Forwarded-For", "10.0.0." + i))
          .andExpect(status().isAccepted());
    }

    assertThat(이메일_접두사의_토큰수("xff-")).isEqualTo(한도);
  }

  private Integer 이메일_접두사의_토큰수(String 접두사) {
    return jdbcTemplate.queryForObject(
        """
        SELECT count(*) FROM password_reset_tokens t
        JOIN users u ON u.id = t.user_id
        WHERE u.email LIKE ?
        """,
        Integer.class,
        접두사 + "%");
  }

  @Test
  void confirm_하면_모든_refreshToken_이_끊긴다() throws Exception {
    String refresh =
        objectMapper
            .readTree(
                mockMvc
                    .perform(가입(("sessions@test.io")))
                    .andReturn()
                    .getResponse()
                    .getContentAsString())
            .get("data")
            .get("refreshToken")
            .asText();
    String 원문 = 토큰을_발급받는다("sessions@test.io");

    mockMvc.perform(확인요청(원문, "newpassword123")).andExpect(status().isOk());

    mockMvc
        .perform(
            post("/api/v1/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"%s\"}".formatted(refresh)))
        .andExpect(status().isUnauthorized());
  }

  private void 가입한다(String 이메일) throws Exception {
    mockMvc.perform(가입(이메일)).andExpect(status().isOk());
  }

  private String 토큰을_발급받는다(String 이메일) {
    String 원문 = OpaqueToken.newToken();
    jdbcTemplate.update(
        """
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
        SELECT id, ?, now() + interval '30 minutes' FROM users WHERE email = ?
        """,
        OpaqueToken.hash(원문),
        이메일);
    return 원문;
  }

  private Integer 토큰수(String 이메일) {
    return jdbcTemplate.queryForObject(
        """
        SELECT count(*) FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
        WHERE u.email = ?
        """,
        Integer.class,
        이메일);
  }

  private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder 가입(
      String 이메일) {
    return post("/api/v1/auth/signup")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"email\":\"%s\",\"password\":\"password123\"}".formatted(이메일));
  }

  private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder 로그인(
      String 이메일, String 비밀번호) {
    return post("/api/v1/auth/login")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(이메일, 비밀번호));
  }

  private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder 재설정요청(
      String 이메일) {
    return post("/api/v1/auth/password-reset")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"email\":\"%s\"}".formatted(이메일));
  }

  private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder 확인요청(
      String 토큰, String 새비밀번호) {
    return post("/api/v1/auth/password-reset/confirm")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"token\":\"%s\",\"newPassword\":\"%s\"}".formatted(토큰, 새비밀번호));
  }
}
