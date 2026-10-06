package site.gachijoopging.server.domain.auth.service;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.login-rate-limit")
public record LoginRateLimitProperties(Duration window, int perEmail, int perIp) {}
