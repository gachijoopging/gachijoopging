package site.gachijoopging.server.domain.chat.event;

import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import site.gachijoopging.server.domain.chat.dto.ChatDeletedResponse;
import site.gachijoopging.server.domain.chat.service.ChatService;
import site.gachijoopging.server.global.websocket.SocketMessage;
import site.gachijoopging.server.global.websocket.WebSocketConfig;

// 롤백된 메시지를 크루원에게 보내지 않게 커밋 뒤에 보낸다. 서로 다른 사람의 메시지는 seq 순서와 다르게 도착할 수 있고,
// 앱이 seq 로 정렬하고 재연결 때 빈 구간을 다시 받는다 (realtime.md §끊김과 이어받기)
@Component
@RequiredArgsConstructor
public class ChatEventListener {

  private final ChatService chatService;
  private final SimpMessagingTemplate messaging;

  // 재전송은 크루에 다시 퍼뜨리지 않는다. 보낸 사람만 echo 를 놓쳤을 수 있어 그 사람에게만 다시 보낸다 (3-7 전송 실패)
  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onSent(ChatMessageSentEvent event) {
    List<UUID> recipients =
        event.created()
            ? chatService.recipients(event.crewId(), event.authorId())
            : List.of(event.authorId());
    send(recipients, new SocketMessage("CHAT", event.message()));
    // 지운 메시지를 재전송하면 echo 가 없어 앱이 끝없이 "전송 실패" 로 남는다. echo 로 id 와 seq 를 잇게 한 뒤
    // 지웠다고 알려 그 말풍선을 "삭제된 메시지" 로 바꾸게 한다. 보낸 사람 본인에게만 간다
    if (event.deleted()) {
      send(
          List.of(event.authorId()),
          new SocketMessage("CHAT_DELETED", new ChatDeletedResponse(event.message().seq())));
    }
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onDeleted(ChatDeletedEvent event) {
    send(
        chatService.members(event.crewId()),
        new SocketMessage("CHAT_DELETED", new ChatDeletedResponse(event.seq())));
  }

  private void send(List<UUID> recipients, SocketMessage message) {
    recipients.forEach(
        recipient ->
            messaging.convertAndSendToUser(
                recipient.toString(), WebSocketConfig.CREW_QUEUE, message));
  }
}
