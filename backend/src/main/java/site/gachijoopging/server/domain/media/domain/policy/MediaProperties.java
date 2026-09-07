package site.gachijoopging.server.domain.media.domain.policy;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.media")
public record MediaProperties(
    String root, String baseUrl, String secureLinkSecret, Duration signedUrlTtl) {}
