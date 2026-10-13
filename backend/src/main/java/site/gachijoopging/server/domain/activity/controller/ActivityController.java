package site.gachijoopging.server.domain.activity.controller;

import jakarta.validation.Valid;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.domain.activity.dto.ActivityResponse;
import site.gachijoopging.server.domain.activity.dto.ActivitySummaryResponse;
import site.gachijoopging.server.domain.activity.dto.AddItemsRequest;
import site.gachijoopging.server.domain.activity.dto.StartActivityRequest;
import site.gachijoopging.server.domain.activity.dto.UpdateItemRequest;
import site.gachijoopging.server.domain.activity.service.ActivityService;
import site.gachijoopging.server.global.response.ApiResponse;
import site.gachijoopging.server.global.security.CurrentUser;

@RestController
@RequiredArgsConstructor
public class ActivityController {

  private final ActivityService activityService;

  @PostMapping("/activities")
  public ResponseEntity<ApiResponse<ActivityResponse>> start(
      @CurrentUser UUID me, @Valid @RequestBody StartActivityRequest request) {
    ActivityService.Started started = activityService.start(me, request);
    return ResponseEntity.status(started.created() ? HttpStatus.CREATED : HttpStatus.OK)
        .body(ApiResponse.of(started.activity()));
  }

  @GetMapping("/activities/current")
  public ApiResponse<ActivityResponse> current(@CurrentUser UUID me) {
    return ApiResponse.of(activityService.current(me).orElse(null));
  }

  @PostMapping("/activities/{id}/pause")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void pause(@CurrentUser UUID me, @PathVariable UUID id) {
    activityService.pause(me, id);
  }

  @PostMapping("/activities/{id}/resume")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void resume(@CurrentUser UUID me, @PathVariable UUID id) {
    activityService.resume(me, id);
  }

  @PostMapping("/activities/{id}/items")
  public ApiResponse<ActivitySummaryResponse> addItems(
      @CurrentUser UUID me, @PathVariable UUID id, @Valid @RequestBody AddItemsRequest request) {
    return ApiResponse.of(activityService.addItems(me, id, request));
  }

  @PatchMapping("/activities/{id}/items/{itemId}")
  public ApiResponse<ActivitySummaryResponse> updateItem(
      @CurrentUser UUID me,
      @PathVariable UUID id,
      @PathVariable UUID itemId,
      @Valid @RequestBody UpdateItemRequest request) {
    return ApiResponse.of(activityService.updateItem(me, id, itemId, request));
  }

  @DeleteMapping("/activities/{id}/items/{itemId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void deleteItem(@CurrentUser UUID me, @PathVariable UUID id, @PathVariable UUID itemId) {
    activityService.deleteItem(me, id, itemId);
  }
}
