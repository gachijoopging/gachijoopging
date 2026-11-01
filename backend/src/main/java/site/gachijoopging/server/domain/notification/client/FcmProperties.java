package site.gachijoopging.server.domain.notification.client;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("app.fcm")
public record FcmProperties(
    String credentials,
    @DefaultValue("5s") Duration connectTimeout,
    @DefaultValue("10s") Duration readTimeout) {}
