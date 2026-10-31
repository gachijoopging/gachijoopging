package site.gachijoopging.server.domain.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import site.gachijoopging.server.domain.auth.service.PasswordResetMailSender;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts;
import site.gachijoopging.server.support.TestAccounts.TestAccount;

@AutoConfigureMockMvc
class PasswordResetTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private StringRedisTemplate redis;

  @MockitoBean private PasswordResetMailSender mailSender;
  @MockitoSpyBean private PasswordEncoder passwordEncoder;

  @BeforeEach
  void 제한을_비운다() {
    redis.getConnectionFactory().getConnection().serverCommands().flushDb();
  }

  @Test
  void 있는_계정도_없는_계정도_204_다() throws Exception {
    가입한다("reset-exists@test.io");

    mockMvc.perform(재설정요청("reset-exists@test.io")).andExpect(status().isNoContent());
    mockMvc.perform(재설정요청("nobody-here@test.io")).andExpect(status().isNoContent());
  }

  @Test
  void 있는_계정에는_6자리_숫자_코드를_메일로_보낸다() throws Exception {
    가입한다("reset-code@test.io");

    assertThat(코드를_받는다("reset-code@test.io")).matches("\\d{6}");
  }

  @Test
  void 없는_계정과_소셜_전용_계정에는_메일을_보내지_않는다() throws Exception {
    jdbcTemplate.update(
        "INSERT INTO users (id, email, kakao_id, password_hash, updated_at) VALUES (gen_random_uuid(), 'social@test.io', 'kakao-reset', NULL, now())");

    mockMvc.perform(재설정요청("ghost@test.io")).andExpect(status().isNoContent());
    mockMvc.perform(재설정요청("social@test.io")).andExpect(status().isNoContent());

    verify(mailSender, never()).send(eq("ghost@test.io"), anyString());
    verify(mailSender, never()).send(eq("social@test.io"), anyString());
  }

  @Test
  void 같은_이메일로_60초_안에_다시_요청하면_429_와_Retry_After_다() throws Exception {
    가입한다("throttle@test.io");
    mockMvc.perform(재설정요청("throttle@test.io")).andExpect(status().isNoContent());

    mockMvc
        .perform(재설정요청("throttle@test.io"))
        .andExpect(status().isTooManyRequests())
        .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
        .andExpect(header().string(HttpHeaders.RETRY_AFTER, "60"));
  }

  @Test
  void 없는_이메일도_같은_제한을_받는다() throws Exception {
    mockMvc.perform(재설정요청("ghost-throttle@test.io")).andExpect(status().isNoContent());

    mockMvc.perform(재설정요청("ghost-throttle@test.io")).andExpect(status().isTooManyRequests());
  }

  @Test
  void 한_IP_의_요청은_XFF_를_바꿔도_한도를_넘지_못한다() throws Exception {
    int 한도 = 10;
    for (int i = 0; i < 한도; i++) {
      mockMvc
          .perform(재설정요청("ip-%d@test.io".formatted(i)).header("X-Forwarded-For", "10.0.0." + i))
          .andExpect(status().isNoContent());
    }

    mockMvc
        .perform(재설정요청("ip-last@test.io").header("X-Forwarded-For", "10.0.0.99"))
        .andExpect(status().isTooManyRequests());
  }

  @Test
  void 맞는_코드로_바꾸면_204_고_새_비밀번호로만_로그인된다() throws Exception {
    가입한다("confirm@test.io");
    String 코드 = 코드를_받는다("confirm@test.io");

    mockMvc
        .perform(확인요청("confirm@test.io", 코드, "newpassword123"))
        .andExpect(status().isNoContent());

    mockMvc.perform(로그인("confirm@test.io", "newpassword123")).andExpect(status().isOk());
    mockMvc.perform(로그인("confirm@test.io", "password123")).andExpect(status().isUnauthorized());
  }

  @Test
  void 바꾸면_모든_refreshToken_이_끊긴다() throws Exception {
    String refresh =
        objectMapper
            .readTree(
                mockMvc
                    .perform(가입("sessions@test.io"))
                    .andReturn()
                    .getResponse()
                    .getContentAsString())
            .get("data")
            .get("refreshToken")
            .asText();
    String 코드 = 코드를_받는다("sessions@test.io");

    mockMvc
        .perform(확인요청("sessions@test.io", 코드, "newpassword123"))
        .andExpect(status().isNoContent());

    mockMvc
        .perform(
            post("/api/v1/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"%s\"}".formatted(refresh)))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void 코드는_한_번만_쓴다() throws Exception {
    가입한다("once@test.io");
    String 코드 = 코드를_받는다("once@test.io");
    mockMvc.perform(확인요청("once@test.io", 코드, "newpassword123")).andExpect(status().isNoContent());

    코드_오류다(mockMvc.perform(확인요청("once@test.io", 코드, "another-password")));
  }

  @Test
  void 틀린_코드는_422_와_code_INVALID_다() throws Exception {
    가입한다("wrong@test.io");
    String 코드 = 코드를_받는다("wrong@test.io");

    코드_오류다(mockMvc.perform(확인요청("wrong@test.io", 다른_코드(코드), "newpassword123")));
  }

  @Test
  void 형식이_틀린_코드도_같은_code_INVALID_다() throws Exception {
    가입한다("format@test.io");
    코드를_받는다("format@test.io");

    코드_오류다(mockMvc.perform(확인요청("format@test.io", "abc", "newpassword123")));
  }

  @Test
  void 없는_이메일도_같은_code_INVALID_다() throws Exception {
    코드_오류다(mockMvc.perform(확인요청("nobody-confirm@test.io", "123456", "newpassword123")));
  }

  @Test
  void 새_코드를_받으면_옛_코드는_못_쓴다() throws Exception {
    가입한다("reissue@test.io");
    String 옛_코드 = 코드를_받는다("reissue@test.io");
    제한을_비운다();
    String 새_코드 = 코드를_받는다("reissue@test.io");

    // 두 코드가 우연히 같으면(백만분의 일) 옛 코드 거부는 확인할 수 없다
    if (!옛_코드.equals(새_코드)) {
      코드_오류다(mockMvc.perform(확인요청("reissue@test.io", 옛_코드, "newpassword123")));
    }
    mockMvc
        .perform(확인요청("reissue@test.io", 새_코드, "newpassword123"))
        .andExpect(status().isNoContent());
  }

  @Test
  void 유효_시간이_지난_코드는_못_쓴다() throws Exception {
    가입한다("expired@test.io");
    String 코드 = 코드를_받는다("expired@test.io");
    jdbcTemplate.update(
        """
        UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'
        WHERE user_id = (SELECT id FROM users WHERE email = 'expired@test.io')
        """);

    코드_오류다(mockMvc.perform(확인요청("expired@test.io", 코드, "newpassword123")));
  }

  @Test
  void 다섯_번_틀리면_맞는_코드도_못_쓴다() throws Exception {
    가입한다("five@test.io");
    String 코드 = 코드를_받는다("five@test.io");
    for (int i = 0; i < 5; i++) {
      코드_오류다(mockMvc.perform(확인요청("five@test.io", 다른_코드(코드), "newpassword123")));
    }

    코드_오류다(mockMvc.perform(확인요청("five@test.io", 코드, "newpassword123")));
    mockMvc.perform(로그인("five@test.io", "password123")).andExpect(status().isOk());
  }

  @Test
  void 네_번_틀려도_맞는_코드는_쓴다() throws Exception {
    가입한다("four@test.io");
    String 코드 = 코드를_받는다("four@test.io");
    for (int i = 0; i < 4; i++) {
      코드_오류다(mockMvc.perform(확인요청("four@test.io", 다른_코드(코드), "newpassword123")));
    }

    mockMvc.perform(확인요청("four@test.io", 코드, "newpassword123")).andExpect(status().isNoContent());
  }

  @Test
  void 바꾸면_그_전에_받은_accessToken_도_거부되고_새로_받은_것은_통한다() throws Exception {
    TestAccount 바꾸는_사람 = TestAccounts.가입한다(mockMvc, "access-reset@test.io");
    TestAccount 가만있는_사람 = TestAccounts.가입한다(mockMvc, "access-keep@test.io");
    String 코드 = 코드를_받는다("access-reset@test.io");

    mockMvc
        .perform(확인요청("access-reset@test.io", 코드, "newpassword123"))
        .andExpect(status().isNoContent());

    mockMvc
        .perform(내_정보(바꾸는_사람.accessToken()))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("TOKEN_EXPIRED"));
    String 새_토큰 =
        objectMapper
            .readTree(
                mockMvc
                    .perform(로그인("access-reset@test.io", "newpassword123"))
                    .andReturn()
                    .getResponse()
                    .getContentAsString())
            .get("data")
            .get("accessToken")
            .asText();
    mockMvc.perform(내_정보(새_토큰)).andExpect(status().isOk());
    mockMvc.perform(내_정보(가만있는_사람.accessToken())).andExpect(status().isOk());
  }

  @Test
  void 이전_비밀번호_확인과_발급_사이에_재설정이_끝나면_그_로그인의_토큰은_모두_거부된다() throws Exception {
    가입한다("race-reset@test.io");
    String 코드 = 코드를_받는다("race-reset@test.io");
    doAnswer(
            확인 -> {
              Object 맞다 = 확인.callRealMethod();
              CompletableFuture.runAsync(
                      () -> {
                        try {
                          mockMvc
                              .perform(확인요청("race-reset@test.io", 코드, "newpassword123"))
                              .andExpect(status().isNoContent());
                        } catch (Exception e) {
                          throw new IllegalStateException(e);
                        }
                      })
                  .join();
              return 맞다;
            })
        .when(passwordEncoder)
        .matches(any(), any());

    JsonNode 토큰 =
        objectMapper
            .readTree(
                mockMvc
                    .perform(로그인("race-reset@test.io", "password123"))
                    .andExpect(status().isOk())
                    .andReturn()
                    .getResponse()
                    .getContentAsString())
            .get("data");

    mockMvc
        .perform(내_정보(토큰.get("accessToken").asText()))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("TOKEN_EXPIRED"));
    mockMvc
        .perform(
            post("/api/v1/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"%s\"}".formatted(토큰.get("refreshToken").asText())))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("TOKEN_EXPIRED"));
  }

  private static MockHttpServletRequestBuilder 내_정보(String accessToken) {
    return get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken);
  }

  private static void 코드_오류다(ResultActions 결과) throws Exception {
    결과.andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION"))
        .andExpect(jsonPath("$.fields[0].field").value("code"))
        .andExpect(jsonPath("$.fields[0].code").value("INVALID"));
  }

  private static String 다른_코드(String 코드) {
    return 코드.equals("000000") ? "000001" : "000000";
  }

  private String 코드를_받는다(String 이메일) throws Exception {
    mockMvc.perform(재설정요청(이메일)).andExpect(status().isNoContent());
    ArgumentCaptor<String> 코드 = ArgumentCaptor.forClass(String.class);
    verify(mailSender, atLeastOnce()).send(eq(이메일), 코드.capture());
    return 코드.getValue();
  }

  private void 가입한다(String 이메일) throws Exception {
    mockMvc.perform(가입(이메일)).andExpect(status().isCreated());
  }

  private static MockHttpServletRequestBuilder 가입(String 이메일) {
    return post("/api/v1/auth/signup")
        .contentType(MediaType.APPLICATION_JSON)
        .content(TestAccounts.가입_본문(이메일));
  }

  private static MockHttpServletRequestBuilder 로그인(String 이메일, String 비밀번호) {
    return post("/api/v1/auth/login")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(이메일, 비밀번호));
  }

  private static MockHttpServletRequestBuilder 재설정요청(String 이메일) {
    return post("/api/v1/auth/password-reset")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"email\":\"%s\"}".formatted(이메일));
  }

  private static MockHttpServletRequestBuilder 확인요청(String 이메일, String 코드, String 새비밀번호) {
    return post("/api/v1/auth/password-reset/confirm")
        .contentType(MediaType.APPLICATION_JSON)
        .content(
            "{\"email\":\"%s\",\"code\":\"%s\",\"newPassword\":\"%s\"}".formatted(이메일, 코드, 새비밀번호));
  }
}
