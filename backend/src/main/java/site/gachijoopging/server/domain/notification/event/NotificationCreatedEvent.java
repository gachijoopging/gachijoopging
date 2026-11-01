package site.gachijoopging.server.domain.notification.event;

import java.util.List;
import java.util.UUID;
import site.gachijoopging.server.domain.notification.dto.NotificationResponse;

/** 한 일이 만든 알림 전부. 받는 사람이 여럿이어도 푸시를 한 번에 보내려고 묶는다. */
public record NotificationCreatedEvent(List<Recipient> recipients) {

  public record Recipient(UUID userId, NotificationResponse notification) {}
}
