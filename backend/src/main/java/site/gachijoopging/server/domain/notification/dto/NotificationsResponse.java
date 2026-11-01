package site.gachijoopging.server.domain.notification.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

public record NotificationsResponse(
    Pending pending, List<NotificationResponse> items, @Schema(nullable = true) String nextCursor) {

  /** 크루장만 센다. 크루원은 둘 다 0 이다. */
  public record Pending(long joinRequests, long reports) {}
}
