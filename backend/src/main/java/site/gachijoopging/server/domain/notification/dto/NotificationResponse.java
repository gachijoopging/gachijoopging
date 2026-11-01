package site.gachijoopging.server.domain.notification.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import site.gachijoopging.server.domain.notification.entity.NotificationTargetType;
import site.gachijoopging.server.domain.notification.entity.NotificationType;

public record NotificationResponse(
    long id,
    NotificationType type,
    String title,
    String detail,
    boolean unread,
    Target target,
    Instant createdAt) {

  public record Target(NotificationTargetType type, @Schema(nullable = true) String id) {}
}
