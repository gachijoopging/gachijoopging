package site.gachijoopging.server.domain.media.client;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.ai")
public record AiProperties(String baseUrl, String secret, Duration timeout) {

  public boolean configured() {
    return baseUrl != null && !baseUrl.isBlank();
  }
}
