package site.gachijoopging.server.domain.auth.service;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.password-reset")
public record PasswordResetProperties(
    Duration codeTtl,
    Duration resendInterval,
    int maxAttempts,
    int perIpLimit,
    Duration perIpWindow) {}
