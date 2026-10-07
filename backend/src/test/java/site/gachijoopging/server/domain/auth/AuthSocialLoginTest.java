package site.gachijoopging.server.domain.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import site.gachijoopging.server.domain.auth.client.GoogleAuthClient;
import site.gachijoopging.server.domain.auth.client.KakaoAuthClient;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts;

@AutoConfigureMockMvc
class AuthSocialLoginTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;

  @MockitoBean private KakaoAuthClient kakaoAuthClient;
  @MockitoBean private GoogleAuthClient googleAuthClient;

  @Test
  void 카카오로_처음_로그인하면_새_계정의_토큰_쌍이_돌아온다() throws Exception {
    given(kakaoAuthClient.verify("카카오-토큰")).willReturn("kakao-처음");

    mockMvc
        .perform(카카오("카카오-토큰", null))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
        .andExpect(jsonPath("$.data.refreshToken").isNotEmpty())
        .andExpect(jsonPath("$.data.isNew").value(true));

    assertThat(회원수("kakao_id", "kakao-처음")).isEqualTo(1);
  }

  @Test
  void 같은_카카오_회원번호로_다시_로그인하면_같은_계정이고_새_계정이_아니다() throws Exception {
    given(kakaoAuthClient.verify("카카오-토큰")).willReturn("kakao-재방문");

    String 첫_로그인 = 사용자_id(카카오("카카오-토큰", null));
    mockMvc.perform(카카오("카카오-토큰", null)).andExpect(jsonPath("$.data.isNew").value(false));
    String 두번째_로그인 = 사용자_id(카카오("카카오-토큰", null));

    assertThat(두번째_로그인).isEqualTo(첫_로그인);
    assertThat(회원수("kakao_id", "kakao-재방문")).isEqualTo(1);
  }

  @Test
  void 닉네임_없이_처음_가입하면_프로필_미완료로_남는다() throws Exception {
    given(kakaoAuthClient.verify("카카오-토큰")).willReturn("kakao-닉네임없음");

    mockMvc
        .perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, 인증(카카오("카카오-토큰", null))))
        .andExpect(jsonPath("$.data.profileComplete").value(false))
        .andExpect(jsonPath("$.data.nickname").isEmpty())
        .andExpect(jsonPath("$.data.email").isEmpty());
  }

  @Test
  void 닉네임과_함께_처음_가입하면_정리해_저장하고_프로필이_완료된다() throws Exception {
    given(googleAuthClient.verify("구글-idToken")).willReturn("google-닉네임");

    mockMvc
        .perform(
            get("/api/v1/users/me")
                .header(HttpHeaders.AUTHORIZATION, 인증(구글("구글-idToken", " 구글줍깅 "))))
        .andExpect(jsonPath("$.data.profileComplete").value(true))
        .andExpect(jsonPath("$.data.nickname").value("구글줍깅"));
  }

  @Test
  void 처음_가입하는데_닉네임이_겹치면_닉네임_없이_만들어_프로필_미완료로_둔다() throws Exception {
    String 닉네임 = TestAccounts.고유_닉네임();
    TestAccounts.가입한다(mockMvc, "social-nick-owner@test.io");
    jdbcTemplate.update(
        "UPDATE users SET nickname = ? WHERE email = 'social-nick-owner@test.io'", 닉네임);
    given(kakaoAuthClient.verify("카카오-토큰")).willReturn("kakao-닉네임겹침");

    String 응답 =
        mockMvc
            .perform(카카오("카카오-토큰", 닉네임))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.isNew").value(true))
            .andReturn()
            .getResponse()
            .getContentAsString();

    mockMvc
        .perform(
            get("/api/v1/users/me")
                .header(
                    HttpHeaders.AUTHORIZATION, "Bearer " + JsonPath.read(응답, "$.data.accessToken")))
        .andExpect(jsonPath("$.data.profileComplete").value(false))
        .andExpect(jsonPath("$.data.nickname").isEmpty());
    assertThat(회원수("kakao_id", "kakao-닉네임겹침")).isEqualTo(1);
  }

  @Test
  void 이미_있는_계정은_보낸_닉네임을_무시한다() throws Exception {
    given(kakaoAuthClient.verify("카카오-토큰")).willReturn("kakao-기존");
    사용자_id(카카오("카카오-토큰", null));

    mockMvc
        .perform(카카오("카카오-토큰", TestAccounts.고유_닉네임()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.isNew").value(false));

    assertThat(
            jdbcTemplate.queryForObject(
                "select nickname from users where kakao_id = 'kakao-기존'", String.class))
        .isNull();
  }

  @Test
  void 구글로_처음_로그인하면_새_계정의_토큰_쌍이_돌아온다() throws Exception {
    given(googleAuthClient.verify("구글-idToken")).willReturn("google-처음");

    mockMvc
        .perform(구글("구글-idToken", null))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
        .andExpect(jsonPath("$.data.isNew").value(true));

    assertThat(회원수("google_sub", "google-처음")).isEqualTo(1);
  }

  @Test
  void 같은_구글_sub_로_다시_로그인해도_계정은_하나다() throws Exception {
    given(googleAuthClient.verify("구글-idToken")).willReturn("google-재방문");

    String 첫_로그인 = 사용자_id(구글("구글-idToken", null));
    String 두번째_로그인 = 사용자_id(구글("구글-idToken", null));

    assertThat(두번째_로그인).isEqualTo(첫_로그인);
    assertThat(회원수("google_sub", "google-재방문")).isEqualTo(1);
  }

  @Test
  void 카카오와_구글은_각각_다른_계정이다() throws Exception {
    given(kakaoAuthClient.verify("카카오-토큰")).willReturn("kakao-따로");
    given(googleAuthClient.verify("구글-idToken")).willReturn("google-따로");

    String 카카오_사용자 = 사용자_id(카카오("카카오-토큰", null));
    String 구글_사용자 = 사용자_id(구글("구글-idToken", null));

    assertThat(구글_사용자).isNotEqualTo(카카오_사용자);
  }

  @Test
  void 토큰_검증이_실패하면_계정을_만들지_않는다() throws Exception {
    willThrow(new BusinessException(ErrorCode.INVALID_CREDENTIALS, "거부"))
        .given(kakaoAuthClient)
        .verify("남의-앱-토큰");

    Integer 이전 = 전체_회원수();

    mockMvc.perform(카카오("남의-앱-토큰", null)).andExpect(status().isUnauthorized());

    assertThat(전체_회원수()).isEqualTo(이전);
  }

  @Test
  void 토큰이_빈_문자열이면_422_다() throws Exception {
    mockMvc.perform(카카오("", null)).andExpect(status().isUnprocessableEntity());
  }

  private String 인증(MockHttpServletRequestBuilder 요청) throws Exception {
    return "Bearer " + 토큰(요청);
  }

  private String 사용자_id(MockHttpServletRequestBuilder 요청) throws Exception {
    return TestAccounts.내_id(mockMvc, 토큰(요청));
  }

  private String 토큰(MockHttpServletRequestBuilder 요청) throws Exception {
    return JsonPath.read(
        mockMvc
            .perform(요청)
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString(),
        "$.data.accessToken");
  }

  private static MockHttpServletRequestBuilder 카카오(String token, String 닉네임) {
    return post("/api/v1/auth/kakao")
        .contentType(MediaType.APPLICATION_JSON)
        .content(본문(token, 닉네임));
  }

  private static MockHttpServletRequestBuilder 구글(String token, String 닉네임) {
    return post("/api/v1/auth/google")
        .contentType(MediaType.APPLICATION_JSON)
        .content(본문(token, 닉네임));
  }

  private static String 본문(String token, String 닉네임) {
    return 닉네임 == null
        ? "{\"token\":\"%s\"}".formatted(token)
        : "{\"token\":\"%s\",\"nickname\":\"%s\"}".formatted(token, 닉네임);
  }

  private Integer 회원수(String 컬럼, String 값) {
    return jdbcTemplate.queryForObject(
        "select count(*) from users where " + 컬럼 + " = ?", Integer.class, 값);
  }

  private Integer 전체_회원수() {
    return jdbcTemplate.queryForObject("select count(*) from users", Integer.class);
  }
}
