package site.gachijoopging.server.domain.auth.client;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.password-reset-mail")
public record PasswordResetMailProperties(String subject, String from) {}
