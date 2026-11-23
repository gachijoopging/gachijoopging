package site.gachijoopging.server.domain.notification.event;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import site.gachijoopging.server.domain.notification.client.FcmPush;
import site.gachijoopging.server.domain.notification.client.FirebaseFcmClient;
import site.gachijoopging.server.domain.notification.dto.NotificationResponse;
import site.gachijoopging.server.domain.notification.entity.NotificationTargetType;
import site.gachijoopging.server.domain.notification.entity.NotificationType;
import site.gachijoopging.server.domain.notification.event.NotificationCreatedEvent.Recipient;
import site.gachijoopging.server.domain.notification.service.NotificationService;
import site.gachijoopging.server.global.websocket.SocketMessage;
import site.gachijoopging.server.global.websocket.WebSocketConfig;

class NotificationPushListenerTest {

  private final NotificationService notificationService = mock(NotificationService.class);
  private final SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
  private final FirebaseFcmClient fcmClient = mock(FirebaseFcmClient.class);
  private final NotificationPushListener listener =
      new NotificationPushListener(notificationService, messaging, fcmClient);

  private final UUID 첫째 = UUID.randomUUID();
  private final UUID 둘째 = UUID.randomUUID();
  private final NotificationResponse 첫째_알림 = 공지_알림(7);
  private final NotificationResponse 둘째_알림 = 공지_알림(8);
  private final NotificationCreatedEvent 이벤트 =
      new NotificationCreatedEvent(List.of(new Recipient(첫째, 첫째_알림), new Recipient(둘째, 둘째_알림)));

  @Test
  void 받는_사람마다_자기_알림을_소켓으로_보내고_FCM_은_모든_기기_토큰을_한_번에_보낸다() {
    when(fcmClient.enabled()).thenReturn(true);
    when(notificationService.pushTokens(List.of(첫째, 둘째)))
        .thenReturn(Map.of(첫째, List.of("token-a", "token-b")));

    listener.onCreated(이벤트);

    verify(messaging)
        .convertAndSendToUser(
            첫째.toString(), WebSocketConfig.CREW_QUEUE, new SocketMessage("NOTIFICATION", 첫째_알림));
    verify(messaging)
        .convertAndSendToUser(
            둘째.toString(), WebSocketConfig.CREW_QUEUE, new SocketMessage("NOTIFICATION", 둘째_알림));
    Map<String, String> 데이터 =
        Map.of("notificationId", "7", "type", "NOTICE", "targetType", "NOTICE", "targetId", "n1");
    verify(fcmClient)
        .send(
            List.of(
                new FcmPush("token-a", "크루장이 공지를 올렸어요", "9월 정기 활동", 데이터),
                new FcmPush("token-b", "크루장이 공지를 올렸어요", "9월 정기 활동", 데이터)));
  }

  @Test
  void FCM_자격이_없으면_소켓만_보내고_토큰을_찾지도_않는다() {
    when(fcmClient.enabled()).thenReturn(false);

    listener.onCreated(이벤트);

    verify(messaging)
        .convertAndSendToUser(
            첫째.toString(), WebSocketConfig.CREW_QUEUE, new SocketMessage("NOTIFICATION", 첫째_알림));
    verify(notificationService, never()).pushTokens(any());
    verify(fcmClient, never()).send(any());
  }

  private static NotificationResponse 공지_알림(long id) {
    return new NotificationResponse(
        id,
        NotificationType.NOTICE,
        "크루장이 공지를 올렸어요",
        "9월 정기 활동",
        true,
        new NotificationResponse.Target(NotificationTargetType.NOTICE, "n1"),
        Instant.parse("2026-10-01T00:00:00Z"));
  }
}
