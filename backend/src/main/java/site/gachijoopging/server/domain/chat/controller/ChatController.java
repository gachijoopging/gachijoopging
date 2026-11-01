package site.gachijoopging.server.domain.chat.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.security.Principal;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.converter.MessageConversionException;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.support.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.domain.chat.dto.ChatMessagesResponse;
import site.gachijoopging.server.domain.chat.dto.ReadChatRequest;
import site.gachijoopging.server.domain.chat.dto.SendChatRequest;
import site.gachijoopging.server.domain.chat.service.ChatService;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.response.ApiResponse;
import site.gachijoopging.server.global.security.CrewMembership;
import site.gachijoopging.server.global.security.CurrentCrew;
import site.gachijoopging.server.global.security.CurrentUser;

@Slf4j
@RestController
@RequiredArgsConstructor
public class ChatController {

  private final ChatService chatService;

  @GetMapping("/crew/chat/messages")
  public ApiResponse<ChatMessagesResponse> messages(
      @CurrentUser UUID me,
      @CurrentCrew CrewMembership crew,
      @RequestParam(required = false) Long beforeSeq,
      @RequestParam(required = false) Long afterSeq,
      @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit) {
    return ApiResponse.of(chatService.messages(me, crew.crewId(), beforeSeq, afterSeq, limit));
  }

  @PutMapping("/crew/chat/read")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void read(
      @CurrentUser UUID me,
      @CurrentCrew CrewMembership crew,
      @Valid @RequestBody ReadChatRequest request) {
    chatService.read(me, crew.crewId(), request.lastSeq());
  }

  @MessageMapping("/crew/chat")
  public void send(Principal user, @Valid @Payload SendChatRequest request) {
    chatService.send(UUID.fromString(user.getName()), request);
  }

  // 소켓에는 응답이 없다. 앱은 echo 가 10초 안에 안 오면 전송 실패로 보여 준다(3-7).
  // 메시지 본문은 남기지 않는다
  @MessageExceptionHandler
  public void rejected(Principal user, BusinessException e) {
    log.warn("채팅 전송 거절 {} — user {}", e.errorCode(), user.getName());
  }

  @MessageExceptionHandler
  public void invalid(Principal user, MethodArgumentNotValidException e) {
    log.warn("채팅 전송 검증 실패 — user {}", user.getName());
  }

  @MessageExceptionHandler
  public void unreadable(Principal user, MessageConversionException e) {
    log.warn("채팅 전송 본문을 읽지 못했다 — user {}", user.getName());
  }

  @MessageExceptionHandler
  public void failed(Principal user, Exception e) {
    log.error("채팅 전송 처리 실패 — user {}", user.getName(), e);
  }
}
