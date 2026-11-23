package site.gachijoopging.server.domain.chat.event;

import java.util.List;
import java.util.UUID;
import site.gachijoopging.server.domain.chat.dto.ChatMessageResponse;

/**
 * created 가 false 면 같은 id 의 재전송이다 — 보낸 사람에게만 다시 echo 한다. deleted 는 그 재전송 대상이 신고로 지워진 경우다.
 * firstUnreadRecipients 는 이 메시지가 마지막으로 읽은 뒤 첫 메시지인 크루원(CHAT 알림 대상).
 */
public record ChatMessageSentEvent(
    UUID crewId,
    UUID authorId,
    ChatMessageResponse message,
    boolean created,
    boolean deleted,
    List<UUID> firstUnreadRecipients) {}
