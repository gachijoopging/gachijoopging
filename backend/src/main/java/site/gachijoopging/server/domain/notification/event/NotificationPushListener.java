package site.gachijoopging.server.domain.notification.event;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import site.gachijoopging.server.domain.notification.client.FcmPush;
import site.gachijoopging.server.domain.notification.client.FirebaseFcmClient;
import site.gachijoopging.server.domain.notification.dto.NotificationResponse;
import site.gachijoopging.server.domain.notification.event.NotificationCreatedEvent.Recipient;
import site.gachijoopging.server.domain.notification.service.NotificationService;
import site.gachijoopging.server.global.config.AsyncConfig;
import site.gachijoopging.server.global.websocket.SocketMessage;
import site.gachijoopging.server.global.websocket.WebSocketConfig;

// 롤백된 일의 알림을 보내지 않게 커밋 뒤에 보낸다. 푸시가 유실돼도 알림 목록에는 남는다
@Component
@RequiredArgsConstructor
public class NotificationPushListener {

  private static final String SOCKET_TYPE = "NOTIFICATION";

  private final NotificationService notificationService;
  private final SimpMessagingTemplate messaging;
  private final FirebaseFcmClient fcmClient;

  @Async(AsyncConfig.PUSH_EXECUTOR)
  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onCreated(NotificationCreatedEvent event) {
    event
        .recipients()
        .forEach(
            recipient ->
                messaging.convertAndSendToUser(
                    recipient.userId().toString(),
                    WebSocketConfig.CREW_QUEUE,
                    new SocketMessage(SOCKET_TYPE, recipient.notification())));
    if (!fcmClient.enabled()) {
      return;
    }
    Map<UUID, List<String>> tokens =
        notificationService.pushTokens(
            event.recipients().stream().map(Recipient::userId).distinct().toList());
    fcmClient.send(
        event.recipients().stream()
            .flatMap(
                recipient ->
                    tokens.getOrDefault(recipient.userId(), List.of()).stream()
                        .map(token -> push(token, recipient.notification())))
            .toList());
  }

  private static FcmPush push(String token, NotificationResponse notification) {
    NotificationResponse.Target target = notification.target();
    Map<String, String> data =
        target.id() == null
            ? Map.of(
                "notificationId", Long.toString(notification.id()),
                "type", notification.type().name(),
                "targetType", target.type().name())
            : Map.of(
                "notificationId", Long.toString(notification.id()),
                "type", notification.type().name(),
                "targetType", target.type().name(),
                "targetId", target.id());
    return new FcmPush(token, notification.title(), notification.detail(), data);
  }
}
