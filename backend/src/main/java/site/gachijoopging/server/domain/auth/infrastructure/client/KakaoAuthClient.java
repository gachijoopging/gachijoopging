package site.gachijoopging.server.domain.auth.infrastructure.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

@Component
@Slf4j
public class KakaoAuthClient {

  private static final String TOKEN_INFO_PATH = "/v1/user/access_token_info";

  private final RestClient restClient;
  private final KakaoAuthProperties properties;

  public KakaoAuthClient(RestClient kakaoAuthRestClient, KakaoAuthProperties properties) {
    this.restClient = kakaoAuthRestClient;
    this.properties = properties;
  }

  public String verify(String accessToken) {
    if (!properties.configured()) {
      log.error("카카오 앱 ID 가 없다 (app.kakao-auth.app-id) — 카카오 로그인을 거부한다");
      throw new BusinessException(ErrorCode.INTERNAL, "카카오 앱 ID 가 설정되지 않았다");
    }

    TokenInfo info = tokenInfo(accessToken);

    if (info == null || info.id() == null || info.appId() == null) {
      throw reject("카카오가 회원번호나 app_id 를 주지 않았다");
    }
    if (!properties.appId().equals(String.valueOf(info.appId()))) {
      log.warn("app_id 가 우리 앱이 아니다 — 기대 {}, 받은 {}", properties.appId(), info.appId());
      throw reject("우리 앱에서 발급된 토큰이 아니다");
    }
    return String.valueOf(info.id());
  }

  private TokenInfo tokenInfo(String accessToken) {
    try {
      return restClient
          .get()
          .uri(TOKEN_INFO_PATH)
          .header("Authorization", "Bearer " + accessToken)
          .retrieve()
          .body(TokenInfo.class);
    } catch (RuntimeException e) {
      log.warn("카카오 토큰 검증 실패: {}", e.toString());
      throw reject("카카오가 토큰을 거절했다");
    }
  }

  private static BusinessException reject(String reason) {
    return new BusinessException(ErrorCode.INVALID_CREDENTIALS, "카카오 토큰 거부 — " + reason);
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record TokenInfo(
      @JsonProperty("id") Long id,
      @JsonProperty("expires_in") Long expiresIn,
      @JsonProperty("app_id") Long appId) {}
}
