package site.gachijoopging.server.domain.crew.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
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
import site.gachijoopging.server.domain.crew.dto.CreateCrewRequest;
import site.gachijoopging.server.domain.crew.dto.CreateJoinRequestRequest;
import site.gachijoopging.server.domain.crew.dto.CrewResponse;
import site.gachijoopging.server.domain.crew.dto.CrewSummaryResponse;
import site.gachijoopging.server.domain.crew.dto.DecideJoinRequestRequest;
import site.gachijoopging.server.domain.crew.dto.JoinRequestResponse;
import site.gachijoopging.server.domain.crew.dto.UpdateCrewRequest;
import site.gachijoopging.server.domain.crew.entity.Region;
import site.gachijoopging.server.domain.crew.service.CrewJoinService;
import site.gachijoopging.server.domain.crew.service.CrewService;
import site.gachijoopging.server.global.response.ApiResponse;
import site.gachijoopging.server.global.response.CursorPage;
import site.gachijoopging.server.global.security.CrewMembership;
import site.gachijoopging.server.global.security.CurrentCrew;
import site.gachijoopging.server.global.security.CurrentUser;

@RestController
@RequiredArgsConstructor
public class CrewController {

  private final CrewService crewService;
  private final CrewJoinService crewJoinService;

  @PostMapping("/crews")
  @ResponseStatus(HttpStatus.CREATED)
  public ApiResponse<CrewResponse> create(
      @CurrentUser UUID me, @Valid @RequestBody CreateCrewRequest request) {
    return ApiResponse.of(crewService.create(me, request));
  }

  @GetMapping("/crews")
  public ApiResponse<CursorPage<CrewSummaryResponse>> search(
      @CurrentUser UUID me,
      @RequestParam(required = false) @Size(min = 1, max = 20) String query,
      @RequestParam(required = false) Region region,
      @RequestParam(required = false) String cursor,
      @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit) {
    return ApiResponse.of(crewService.search(me, query, region, cursor, limit));
  }

  @GetMapping("/crew")
  public ApiResponse<CrewResponse> get(
      @CurrentUser UUID me, @CurrentCrew CrewMembership membership) {
    return ApiResponse.of(crewService.get(me, membership));
  }

  @PatchMapping("/crew")
  public ApiResponse<CrewResponse> update(
      @CurrentUser UUID me,
      @CurrentCrew CrewMembership membership,
      @Valid @RequestBody UpdateCrewRequest request) {
    return ApiResponse.of(crewService.update(me, membership, request));
  }

  @PostMapping("/crews/join-requests")
  public ResponseEntity<ApiResponse<JoinRequestResponse>> apply(
      @CurrentUser UUID me, @Valid @RequestBody CreateJoinRequestRequest request) {
    CrewJoinService.Applied applied = crewJoinService.apply(me, request.crewId());
    return ResponseEntity.status(applied.created() ? HttpStatus.CREATED : HttpStatus.OK)
        .body(ApiResponse.of(applied.request()));
  }

  @GetMapping("/crews/join-requests/mine")
  public ApiResponse<JoinRequestResponse> mine(@CurrentUser UUID me) {
    return ApiResponse.of(crewJoinService.mine(me).orElse(null));
  }

  @DeleteMapping("/crews/join-requests/mine")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void cancelMine(@CurrentUser UUID me) {
    crewJoinService.cancelMine(me);
  }

  @PostMapping("/crews/join-requests/{requestId}/read")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void markRejectionRead(@CurrentUser UUID me, @PathVariable UUID requestId) {
    crewJoinService.markRejectionRead(me, requestId);
  }

  @GetMapping("/crew/join-requests")
  public ApiResponse<CursorPage<JoinRequestResponse>> pending(
      @CurrentCrew CrewMembership membership,
      @RequestParam(required = false) String cursor,
      @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit) {
    return ApiResponse.of(crewJoinService.pending(membership, cursor, limit));
  }

  @PostMapping("/crew/join-requests/{requestId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void decide(
      @CurrentUser UUID me,
      @CurrentCrew CrewMembership membership,
      @PathVariable UUID requestId,
      @Valid @RequestBody DecideJoinRequestRequest request) {
    crewJoinService.decide(me, membership, requestId, request.decision());
  }
}
