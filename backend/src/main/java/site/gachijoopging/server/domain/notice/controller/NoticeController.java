package site.gachijoopging.server.domain.notice.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.domain.notice.dto.CreateNoticeRequest;
import site.gachijoopging.server.domain.notice.dto.NoticeDetailResponse;
import site.gachijoopging.server.domain.notice.dto.NoticeResponse;
import site.gachijoopging.server.domain.notice.dto.UpdateNoticeRequest;
import site.gachijoopging.server.domain.notice.service.NoticeService;
import site.gachijoopging.server.domain.post.dto.CommentResponse;
import site.gachijoopging.server.domain.post.dto.CreateCommentRequest;
import site.gachijoopging.server.global.response.ApiResponse;
import site.gachijoopging.server.global.response.CursorPage;
import site.gachijoopging.server.global.security.CrewMembership;
import site.gachijoopging.server.global.security.CurrentCrew;
import site.gachijoopging.server.global.security.CurrentUser;

@RestController
@RequiredArgsConstructor
public class NoticeController {

  private final NoticeService noticeService;

  @GetMapping("/crew/notices")
  public ApiResponse<CursorPage<NoticeResponse>> list(
      @CurrentUser UUID me,
      @CurrentCrew CrewMembership crew,
      @RequestParam(required = false) String cursor,
      @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit) {
    return ApiResponse.of(noticeService.list(me, crew, cursor, limit));
  }

  @PostMapping("/crew/notices")
  public ResponseEntity<ApiResponse<NoticeResponse>> create(
      @CurrentUser UUID me,
      @CurrentCrew CrewMembership crew,
      @Valid @RequestBody CreateNoticeRequest request) {
    NoticeService.Created created = noticeService.create(me, crew, request);
    return ResponseEntity.status(created.created() ? HttpStatus.CREATED : HttpStatus.OK)
        .body(ApiResponse.of(created.notice()));
  }

  @GetMapping("/notices/{noticeId}")
  public ApiResponse<NoticeDetailResponse> detail(
      @CurrentUser UUID me, @CurrentCrew CrewMembership crew, @PathVariable UUID noticeId) {
    return ApiResponse.of(noticeService.detail(me, crew, noticeId));
  }

  @PatchMapping("/notices/{noticeId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void update(
      @CurrentUser UUID me,
      @CurrentCrew CrewMembership crew,
      @PathVariable UUID noticeId,
      @RequestBody UpdateNoticeRequest request) {
    noticeService.update(me, crew, noticeId, request);
  }

  @DeleteMapping("/notices/{noticeId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(
      @CurrentUser UUID me, @CurrentCrew CrewMembership crew, @PathVariable UUID noticeId) {
    noticeService.delete(me, crew, noticeId);
  }

  @PostMapping("/notices/{noticeId}/comments")
  @ResponseStatus(HttpStatus.CREATED)
  public ApiResponse<CommentResponse> comment(
      @CurrentUser UUID me,
      @CurrentCrew CrewMembership crew,
      @PathVariable UUID noticeId,
      @Valid @RequestBody CreateCommentRequest request) {
    return ApiResponse.of(noticeService.comment(me, crew, noticeId, request));
  }

  @DeleteMapping("/notice-comments/{commentId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteComment(
      @CurrentUser UUID me, @CurrentCrew CrewMembership crew, @PathVariable UUID commentId) {
    noticeService.deleteComment(me, crew, commentId);
  }
}
