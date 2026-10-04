package site.gachijoopging.server.domain.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static site.gachijoopging.server.support.TestAccounts.가입한다;

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
import site.gachijoopging.server.support.TestAccounts.TestAccount;

@AutoConfigureMockMvc
class SocialLinkApiTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;

  @MockitoBean private KakaoAuthClient kakaoAuthClient;
  @MockitoBean private GoogleAuthClient googleAuthClient;

  @Test
  void 카카오를_연결하면_그_카카오로_로그인해도_같은_계정이다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "social-link-kakao@example.com");
    given(kakaoAuthClient.verify("카카오-토큰")).willReturn("kakao-연결됨");

    mockMvc.perform(연결(나, "KAKAO", "카카오-토큰")).andExpect(status().isNoContent());

    assertThat(사용자_id(카카오("카카오-토큰"))).isEqualTo(나.id().toString());
  }

  @Test
  void 구글을_연결하면_그_구글로_로그인해도_같은_계정이다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "social-link-google@example.com");
    given(googleAuthClient.verify("구글-idToken")).willReturn("google-연결됨");

    mockMvc.perform(연결(나, "GOOGLE", "구글-idToken")).andExpect(status().isNoContent());

    assertThat(사용자_id(구글("구글-idToken"))).isEqualTo(나.id().toString());
  }

  @Test
  void 같은_카카오를_다시_연결해도_200이다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "social-link-idempotent@example.com");
    given(kakaoAuthClient.verify("카카오-토큰")).willReturn("kakao-멱등");

    mockMvc.perform(연결(나, "KAKAO", "카카오-토큰")).andExpect(status().isNoContent());
    mockMvc.perform(연결(나, "KAKAO", "카카오-토큰")).andExpect(status().isNoContent());

    assertThat(회원수("kakao_id", "kakao-멱등")).isEqualTo(1);
  }

  @Test
  void 이미_카카오가_붙어_있으면_다른_카카오는_409다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "social-link-replace@example.com");
    given(kakaoAuthClient.verify("먼저-토큰")).willReturn("kakao-먼저");
    given(kakaoAuthClient.verify("나중-토큰")).willReturn("kakao-나중");

    mockMvc.perform(연결(나, "KAKAO", "먼저-토큰")).andExpect(status().isNoContent());
    mockMvc.perform(연결(나, "KAKAO", "나중-토큰")).andExpect(status().isConflict());

    assertThat(회원수("kakao_id", "kakao-먼저")).isEqualTo(1);
    assertThat(회원수("kakao_id", "kakao-나중")).isEqualTo(0);
  }

  @Test
  void 남에게_붙어_있는_카카오는_409다() throws Exception {
    given(kakaoAuthClient.verify("남의-토큰")).willReturn("kakao-남의것");
    사용자_id(카카오("남의-토큰"));

    TestAccount 나 = 가입한다(mockMvc, "social-link-taken@example.com");

    mockMvc.perform(연결(나, "KAKAO", "남의-토큰")).andExpect(status().isConflict());

    assertThat(회원수("kakao_id", "kakao-남의것")).isEqualTo(1);
  }

  @Test
  void 토큰_검증이_실패하면_연결하지_않는다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "social-link-rejected@example.com");
    willThrow(new BusinessException(ErrorCode.INVALID_CREDENTIALS, "거부"))
        .given(kakaoAuthClient)
        .verify("남의-앱-토큰");

    mockMvc.perform(연결(나, "KAKAO", "남의-앱-토큰")).andExpect(status().isUnauthorized());

    assertThat(카카오가_붙은_회원수(나)).isZero();
  }

  private static MockHttpServletRequestBuilder 연결(TestAccount 계정, String provider, String token) {
    return put("/api/v1/users/me/social")
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"provider\":\"%s\",\"token\":\"%s\"}".formatted(provider, token));
  }

  private static MockHttpServletRequestBuilder 카카오(String accessToken) {
    return post("/api/v1/auth/kakao")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"kakaoAccessToken\":\"%s\"}".formatted(accessToken));
  }

  private static MockHttpServletRequestBuilder 구글(String idToken) {
    return post("/api/v1/auth/google")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"idToken\":\"%s\"}".formatted(idToken));
  }

  private Integer 회원수(String 컬럼, String 값) {
    return jdbcTemplate.queryForObject(
        "select count(*) from users where " + 컬럼 + " = ?", Integer.class, 값);
  }

  private Integer 카카오가_붙은_회원수(TestAccount 계정) {
    return jdbcTemplate.queryForObject(
        "select count(*) from users where id = ? and kakao_id is not null", Integer.class, 계정.id());
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
}
