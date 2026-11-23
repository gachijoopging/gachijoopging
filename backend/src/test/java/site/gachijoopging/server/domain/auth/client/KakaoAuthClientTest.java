package site.gachijoopging.server.domain.auth.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

class KakaoAuthClientTest {

  private static final String BASE_URL = "https://kapi.kakao.com";

  private static final String 우리_앱 = "1234";

  private static final String 토큰_정보_URL = BASE_URL + "/v1/user/access_token_info";

  private static final String 토큰_정보 =
      """
      {"id":123456789,"expires_in":7199,"app_id":1234}
      """;

  private static final String 유효하지_않은_토큰 =
      """
      {"code":-401,"message":"유효하지 않은 앱키나 액세스 토큰"}
      """;

  private MockRestServiceServer 카카오;

  private KakaoAuthClient 클라이언트(String appId) {
    RestClient.Builder builder = RestClient.builder();
    카카오 = MockRestServiceServer.bindTo(builder).build();
    return new KakaoAuthClient(
        builder.baseUrl(BASE_URL).build(),
        new KakaoAuthProperties(BASE_URL, appId, Duration.ofSeconds(3)));
  }

  @Test
  void 앱이_일치하면_회원번호를_돌려준다() {
    KakaoAuthClient client = 클라이언트(우리_앱);
    카카오.expect(requestTo(토큰_정보_URL)).andRespond(withSuccess(토큰_정보, MediaType.APPLICATION_JSON));

    assertThat(client.verify("카카오-액세스-토큰")).isEqualTo("123456789");
    카카오.verify();
  }

  @Test
  void 다른_앱에서_발급된_토큰은_거부한다() {
    KakaoAuthClient client = 클라이언트("9999");
    카카오.expect(requestTo(토큰_정보_URL)).andRespond(withSuccess(토큰_정보, MediaType.APPLICATION_JSON));

    assertThatThrownBy(() -> client.verify("남의-앱-토큰"))
        .isInstanceOf(BusinessException.class)
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.INVALID_CREDENTIALS);
  }

  @Test
  void 유효하지_않은_토큰은_거부한다() {
    KakaoAuthClient client = 클라이언트(우리_앱);
    카카오.expect(requestTo(토큰_정보_URL))
        .andRespond(
            withStatus(HttpStatus.UNAUTHORIZED)
                .body(유효하지_않은_토큰)
                .contentType(MediaType.APPLICATION_JSON));

    assertThatThrownBy(() -> client.verify("만료된-토큰"))
        .isInstanceOf(BusinessException.class)
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.INVALID_CREDENTIALS);
  }

  @Test
  void 사용자_토큰을_Bearer_로_보낸다() {
    KakaoAuthClient client = 클라이언트(우리_앱);
    카카오.expect(header("Authorization", "Bearer 카카오-액세스-토큰"))
        .andRespond(withSuccess(토큰_정보, MediaType.APPLICATION_JSON));

    client.verify("카카오-액세스-토큰");
    카카오.verify();
  }

  @Test
  void 설정이_없으면_카카오를_부르지_않고_거부한다() {
    KakaoAuthClient client = 클라이언트("");

    assertThatThrownBy(() -> client.verify("카카오-액세스-토큰"))
        .isInstanceOf(BusinessException.class)
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.INTERNAL);

    카카오.verify();
  }
}
