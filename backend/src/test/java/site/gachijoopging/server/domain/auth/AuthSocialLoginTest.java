package site.gachijoopging.server.domain.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import site.gachijoopging.server.domain.auth.infrastructure.client.GoogleAuthClient;
import site.gachijoopging.server.domain.auth.infrastructure.client.KakaoAuthClient;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.support.IntegrationTest;

@AutoConfigureMockMvc
class AuthSocialLoginTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;

  @MockitoBean private KakaoAuthClient kakaoAuthClient;
  @MockitoBean private GoogleAuthClient googleAuthClient;

  @Test
  void 카카오로_처음_로그인하면_세션이_돌아온다() throws Exception {
    given(kakaoAuthClient.verify("카카오-토큰")).willReturn("kakao-처음");

    mockMvc
        .perform(카카오("카카오-토큰"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
        .andExpect(jsonPath("$.data.refreshToken").isNotEmpty())
        .andExpect(jsonPath("$.data.onboardingRequired").value(true))
        .andExpect(jsonPath("$.data.user.email").value(nullValue()));

    assertThat(회원수("kakao_id", "kakao-처음")).isEqualTo(1);
  }

  @Test
  void 같은_카카오_회원번호로_다시_로그인해도_계정은_하나다() throws Exception {
    given(kakaoAuthClient.verify("카카오-토큰")).willReturn("kakao-재방문");

    String 첫_로그인 = 사용자_id(카카오("카카오-토큰"));
    String 두번째_로그인 = 사용자_id(카카오("카카오-토큰"));

    assertThat(두번째_로그인).isEqualTo(첫_로그인);
    assertThat(회원수("kakao_id", "kakao-재방문")).isEqualTo(1);
  }

  @Test
  void 구글로_처음_로그인하면_세션이_돌아온다() throws Exception {
    given(googleAuthClient.verify("구글-idToken")).willReturn("google-처음");

    mockMvc
        .perform(구글("구글-idToken"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
        .andExpect(jsonPath("$.data.onboardingRequired").value(true));

    assertThat(회원수("google_sub", "google-처음")).isEqualTo(1);
  }

  @Test
  void 같은_구글_sub_로_다시_로그인해도_계정은_하나다() throws Exception {
    given(googleAuthClient.verify("구글-idToken")).willReturn("google-재방문");

    String 첫_로그인 = 사용자_id(구글("구글-idToken"));
    String 두번째_로그인 = 사용자_id(구글("구글-idToken"));

    assertThat(두번째_로그인).isEqualTo(첫_로그인);
    assertThat(회원수("google_sub", "google-재방문")).isEqualTo(1);
  }

  @Test
  void 카카오와_구글은_각각_다른_계정이다() throws Exception {
    given(kakaoAuthClient.verify("카카오-토큰")).willReturn("kakao-따로");
    given(googleAuthClient.verify("구글-idToken")).willReturn("google-따로");

    String 카카오_사용자 = 사용자_id(카카오("카카오-토큰"));
    String 구글_사용자 = 사용자_id(구글("구글-idToken"));

    assertThat(구글_사용자).isNotEqualTo(카카오_사용자);
  }

  @Test
  void 토큰_검증이_실패하면_계정을_만들지_않는다() throws Exception {
    willThrow(new BusinessException(ErrorCode.INVALID_CREDENTIALS, "거부"))
        .given(kakaoAuthClient)
        .verify("남의-앱-토큰");

    Integer 이전 = 전체_회원수();

    mockMvc.perform(카카오("남의-앱-토큰")).andExpect(status().isUnauthorized());

    assertThat(전체_회원수()).isEqualTo(이전);
  }

  @Test
  void 토큰이_빈_문자열이면_422_다() throws Exception {
    mockMvc.perform(카카오("")).andExpect(status().isUnprocessableEntity());
  }

  private String 사용자_id(MockHttpServletRequestBuilder 요청) throws Exception {
    return JsonPath.read(
        mockMvc
            .perform(요청)
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString(),
        "$.data.user.id");
  }

  private static MockHttpServletRequestBuilder 카카오(String accessToken) {
    return post("/api/v1/auth/kakao")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"kakaoAccessToken\":\"" + accessToken + "\"}");
  }

  private static MockHttpServletRequestBuilder 구글(String idToken) {
    return post("/api/v1/auth/google")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"idToken\":\"" + idToken + "\"}");
  }

  private Integer 회원수(String 컬럼, String 값) {
    return jdbcTemplate.queryForObject(
        "select count(*) from users where " + 컬럼 + " = ?", Integer.class, 값);
  }

  private Integer 전체_회원수() {
    return jdbcTemplate.queryForObject("select count(*) from users", Integer.class);
  }
}
