package site.gachijoopging.server.domain.safety.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.domain.safety.dto.BlockedUsersResponse;
import site.gachijoopging.server.domain.safety.dto.CreateReportRequest;
import site.gachijoopging.server.domain.safety.dto.ProcessReportRequest;
import site.gachijoopging.server.domain.safety.dto.ReportResponse;
import site.gachijoopging.server.domain.safety.service.BlockService;
import site.gachijoopging.server.domain.safety.service.ReportService;
import site.gachijoopging.server.global.response.ApiResponse;
import site.gachijoopging.server.global.response.CursorPage;
import site.gachijoopging.server.global.security.CrewMembership;
import site.gachijoopging.server.global.security.CurrentCrew;
import site.gachijoopging.server.global.security.CurrentUser;

@RestController
@RequiredArgsConstructor
public class SafetyController {

  private final BlockService blockService;
  private final ReportService reportService;

  @GetMapping("/users/me/blocked")
  public ApiResponse<BlockedUsersResponse> blocked(
      @CurrentUser UUID me,
      @RequestParam(required = false) String cursor,
      @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit) {
    return ApiResponse.of(blockService.blocked(me, cursor, limit));
  }

  @PutMapping("/users/{userId}/block")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void block(@CurrentUser UUID me, @PathVariable UUID userId) {
    blockService.block(me, userId);
  }

  @DeleteMapping("/users/{userId}/block")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void unblock(@CurrentUser UUID me, @PathVariable UUID userId) {
    blockService.unblock(me, userId);
  }

  @PostMapping("/reports")
  public ResponseEntity<Void> report(
      @CurrentUser UUID me,
      @CurrentCrew CrewMembership crew,
      @Valid @RequestBody CreateReportRequest request) {
    return ResponseEntity.status(
            reportService.create(me, crew, request) ? HttpStatus.CREATED : HttpStatus.OK)
        .build();
  }

  @GetMapping("/crew/reports")
  public ApiResponse<CursorPage<ReportResponse>> pending(
      @CurrentCrew CrewMembership crew,
      @RequestParam(required = false) String cursor,
      @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit) {
    return ApiResponse.of(reportService.pending(crew, cursor, limit));
  }

  @PostMapping("/crew/reports/{reportId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void process(
      @CurrentUser UUID me,
      @CurrentCrew CrewMembership crew,
      @PathVariable UUID reportId,
      @Valid @RequestBody ProcessReportRequest request) {
    reportService.process(me, crew, reportId, request.result());
  }
}
