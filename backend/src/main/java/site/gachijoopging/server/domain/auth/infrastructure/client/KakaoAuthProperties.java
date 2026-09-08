package site.gachijoopging.server.domain.auth.infrastructure.client;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.kakao-auth")
public record KakaoAuthProperties(String baseUrl, String appId, Duration timeout) {

  public boolean configured() {
    return appId != null && !appId.isBlank();
  }
}
