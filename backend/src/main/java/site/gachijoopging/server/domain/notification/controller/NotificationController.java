package site.gachijoopging.server.domain.notification.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.domain.notification.dto.NotificationsResponse;
import site.gachijoopging.server.domain.notification.dto.ReadNotificationsRequest;
import site.gachijoopging.server.domain.notification.dto.UnreadCountResponse;
import site.gachijoopging.server.domain.notification.service.NotificationService;
import site.gachijoopging.server.global.response.ApiResponse;
import site.gachijoopging.server.global.security.CrewMembership;
import site.gachijoopging.server.global.security.CurrentCrew;
import site.gachijoopging.server.global.security.CurrentUser;

@RestController
@RequiredArgsConstructor
public class NotificationController {

  private final NotificationService notificationService;

  // 알림 목록은 크루원만 연다 — 미가입자는 가입 결과를 푸시로만 받는다 (2-3)
  @GetMapping("/notifications")
  public ApiResponse<NotificationsResponse> list(
      @CurrentUser UUID me,
      @CurrentCrew CrewMembership crew,
      @RequestParam(required = false) String cursor,
      @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit) {
    return ApiResponse.of(notificationService.list(me, crew, cursor, limit));
  }

  @PostMapping("/notifications/read")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void read(
      @CurrentUser UUID me,
      @Valid @RequestBody(required = false) ReadNotificationsRequest request) {
    notificationService.read(me, request);
  }

  @GetMapping("/notifications/unread-count")
  public ApiResponse<UnreadCountResponse> unreadCount(@CurrentUser UUID me) {
    return ApiResponse.of(new UnreadCountResponse(notificationService.unreadCount(me)));
  }
}
