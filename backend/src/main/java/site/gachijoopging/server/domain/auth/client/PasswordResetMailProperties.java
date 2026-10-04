package site.gachijoopging.server.domain.auth.client;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.password-reset-mail")
public record PasswordResetMailProperties(String linkBase, String subject, String from) {

  public String link(String rawToken) {
    return linkBase + "?token=" + rawToken;
  }
}
