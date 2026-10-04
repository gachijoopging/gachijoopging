package site.gachijoopging.server.domain.auth.client;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.google-auth")
public record GoogleAuthProperties(String clientId, String jwksUri, Duration timeout) {

  public boolean configured() {
    return clientId != null && !clientId.isBlank();
  }
}
