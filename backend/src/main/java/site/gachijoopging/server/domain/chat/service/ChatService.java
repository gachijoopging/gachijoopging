package site.gachijoopging.server.domain.chat.service;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.chat.dto.ChatMessageResponse;
import site.gachijoopging.server.domain.chat.dto.ChatMessagesResponse;
import site.gachijoopging.server.domain.chat.dto.SendChatRequest;
import site.gachijoopging.server.domain.chat.entity.ChatMessage;
import site.gachijoopging.server.domain.chat.event.ChatDeletedEvent;
import site.gachijoopging.server.domain.chat.event.ChatMessageSentEvent;
import site.gachijoopging.server.domain.chat.repository.ChatMessageRepository;
import site.gachijoopging.server.domain.chat.repository.ChatQueryRepository;
import site.gachijoopging.server.domain.chat.repository.ChatQueryRepository.MessageRow;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;
import site.gachijoopging.server.domain.media.service.MediaSignedUrl;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChatService {

  private static final int MAX_TEXT = 500;

  private static final String WITHDRAWN_NICKNAME = "탈퇴한 크루원";

  private final ChatMessageRepository messageRepository;
  private final ChatQueryRepository queryRepository;
  private final MediaSignedUrl signedUrl;
  private final ApplicationEventPublisher events;
  private final Clock clock;

  @Transactional
  public void send(UUID me, SendChatRequest request) {
    // 잘못된 입력이 크루 저장 줄을 막지 않게 잠금 전에 거른다. 재전송도 같은 본문이라 결과가 같다.
    // DB CHECK(char_length)와 같게 code point 로 센다. @Size 는 UTF-16 단위라 이모지를 두 글자로 센다
    String text = request.text().strip();
    int length = text.codePointCount(0, text.length());
    if (length < 1 || length > MAX_TEXT) {
      throw new BusinessException(ErrorCode.VALIDATION, "메시지는 1~" + MAX_TEXT + "자다");
    }
    UUID crewId =
        queryRepository
            .lockCrewOf(me)
            .orElseThrow(() -> new BusinessException(ErrorCode.NO_CREW, "소속 크루가 없다"));
    queryRepository.lockCrewChat(crewId);
    ChatMessage same = messageRepository.findById(request.id()).orElse(null);
    if (same != null) {
      if (!same.sentBy(me, crewId)) {
        throw new BusinessException(ErrorCode.FORBIDDEN, "남의 메시지 id 다");
      }
      events.publishEvent(
          new ChatMessageSentEvent(
              crewId, me, message(same.getId()), false, same.getDeletedAt() != null, List.of()));
      return;
    }

    // 이 메시지를 넣기 전에 골라야 "읽은 뒤 첫 메시지" 를 가를 수 있다
    List<UUID> firstUnread = queryRepository.findFirstUnreadRecipients(crewId, me);
    // 같은 크루 저장은 잠금으로 줄 섰으니, 0 이면 다른 크루·다른 사람이 같은 id 를 먼저 넣은 것이다
    if (messageRepository.insertIfAbsent(request.id(), crewId, me, text, clock.instant()) == 0) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "남의 메시지 id 다");
    }
    events.publishEvent(
        new ChatMessageSentEvent(crewId, me, message(request.id()), true, false, firstUnread));
  }

  public ChatMessagesResponse messages(
      UUID me, UUID crewId, Long beforeSeq, Long afterSeq, int limit) {
    if (beforeSeq != null && afterSeq != null) {
      throw new BusinessException(ErrorCode.VALIDATION, "beforeSeq 와 afterSeq 는 함께 쓰지 않는다");
    }
    if (afterSeq != null) {
      List<MessageRow> rows = queryRepository.findAfter(crewId, me, afterSeq, limit + 1);
      return new ChatMessagesResponse(
          rows.subList(0, Math.min(limit, rows.size())).stream().map(this::response).toList(),
          rows.size() > limit);
    }
    List<MessageRow> rows = queryRepository.findLatest(crewId, me, beforeSeq, limit + 1);
    List<ChatMessageResponse> page =
        new ArrayList<>(
            rows.subList(0, Math.min(limit, rows.size())).stream().map(this::response).toList());
    return new ChatMessagesResponse(page.reversed(), rows.size() > limit);
  }

  // 메시지 저장과 같은 잠금을 잡는다 — 저장이 "읽은 뒤 첫 메시지" 를 가르는 사이 읽음이 끼어들면,
  // 옛 읽음 위치로 판단해 알림을 건너뛰고 그 뒤로는 다시 읽을 때까지 아무 알림도 오지 않는다
  @Transactional
  public void read(UUID me, UUID crewId, long lastSeq) {
    queryRepository.lockCrewChat(crewId);
    messageRepository.markRead(crewId, me, lastSeq, clock.instant());
  }

  /** GET /crew 의 unreadChat. */
  public int unreadCount(UUID crewId, UUID userId) {
    return queryRepository.countUnread(crewId, userId);
  }

  public List<UUID> recipients(UUID crewId, UUID authorId) {
    return queryRepository.findRecipients(crewId, authorId);
  }

  public List<UUID> members(UUID crewId) {
    return queryRepository.findMembers(crewId);
  }

  // 신고 처리의 삭제는 크루장 관리라 차단과 무관하다. 이미 지워졌으면 다시 알리지 않는다
  @Transactional(propagation = Propagation.MANDATORY)
  public void deleteReported(UUID leaderId, UUID crewId, UUID messageId) {
    messageRepository
        .deleteIfLive(messageId, crewId, leaderId, clock.instant())
        .ifPresent(seq -> events.publishEvent(new ChatDeletedEvent(crewId, seq)));
  }

  private ChatMessageResponse message(UUID id) {
    return response(
        queryRepository
            .findMessage(id)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "없는 메시지다")));
  }

  // 탈퇴한 사람은 이름·사진 없이 "탈퇴한 크루원" 으로 보인다 (ERD 회원 탈퇴 때)
  private ChatMessageResponse response(MessageRow row) {
    UserBriefResponse author =
        "DELETED".equals(row.status())
            ? new UserBriefResponse(row.authorId().toString(), WITHDRAWN_NICKNAME, null, true)
            : new UserBriefResponse(
                row.authorId().toString(),
                Objects.requireNonNullElse(row.nickname(), ""),
                row.photoKey() == null ? null : signedUrl.of(row.photoKey()),
                false);
    return new ChatMessageResponse(
        row.seq(), row.id().toString(), author, row.text(), row.createdAt());
  }
}
