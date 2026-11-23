package site.gachijoopging.server.global.batch;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.retention")
public record RetentionProperties(
    Duration softDeleted, Duration resolvedReport, Duration staleLiveLocation) {}
