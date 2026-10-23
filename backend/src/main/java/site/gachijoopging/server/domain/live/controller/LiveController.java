package site.gachijoopging.server.domain.live.controller;

import jakarta.validation.Valid;
import java.security.Principal;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.support.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.domain.live.dto.LiveMemberResponse;
import site.gachijoopging.server.domain.live.dto.ReportLiveRequest;
import site.gachijoopging.server.domain.live.service.LiveService;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.response.ApiResponse;
import site.gachijoopging.server.global.security.CrewMembership;
import site.gachijoopging.server.global.security.CurrentCrew;
import site.gachijoopging.server.global.security.CurrentUser;

@Slf4j
@RestController
@RequiredArgsConstructor
public class LiveController {

  private final LiveService liveService;

  @PostMapping("/activities/{id}/live")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void report(
      @CurrentUser UUID me, @PathVariable UUID id, @Valid @RequestBody ReportLiveRequest request) {
    liveService.report(me, id, request);
  }

  @GetMapping("/crew/live")
  public ApiResponse<List<LiveMemberResponse>> crewLive(
      @CurrentUser UUID me, @CurrentCrew CrewMembership crew) {
    return ApiResponse.of(liveService.crewLive(me, crew.crewId()));
  }

  @MessageMapping("/crew/live")
  public void report(Principal user, @Valid @Payload ReportLiveRequest request) {
    liveService.report(UUID.fromString(user.getName()), request.activityId(), request);
  }

  // 소켓에는 응답이 없다. 앱은 5초 뒤 다음 점을 보내므로 거절은 남기기만 한다.
  // 검증 실패 메시지에는 거부된 값(좌표)이 실리므로 찍지 않는다
  @MessageExceptionHandler
  public void rejected(Principal user, BusinessException e) {
    log.warn("소켓 위치 보고 거절 {} — user {}", e.errorCode(), user.getName());
  }

  @MessageExceptionHandler
  public void invalid(Principal user, MethodArgumentNotValidException e) {
    log.warn("소켓 위치 보고 검증 실패 — user {}", user.getName());
  }

  @MessageExceptionHandler
  public void failed(Principal user, Exception e) {
    log.error("소켓 위치 보고 처리 실패 — user {}", user.getName(), e);
  }
}
