package site.gachijoopging.server.domain.crew.controller;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.domain.crew.dto.CreateCrewRequest;
import site.gachijoopging.server.domain.crew.dto.CrewPreviewResponse;
import site.gachijoopging.server.domain.crew.dto.CrewResponse;
import site.gachijoopging.server.domain.crew.dto.UpdateCrewRequest;
import site.gachijoopging.server.domain.crew.service.CrewService;
import site.gachijoopging.server.domain.crew.service.InviteCodes;
import site.gachijoopging.server.global.response.ApiResponse;
import site.gachijoopging.server.global.security.CrewMembership;
import site.gachijoopging.server.global.security.CurrentCrew;
import site.gachijoopging.server.global.security.CurrentUser;

@RestController
@RequiredArgsConstructor
public class CrewController {

  private final CrewService crewService;

  @PostMapping("/crews")
  @ResponseStatus(HttpStatus.CREATED)
  public ApiResponse<CrewResponse> create(
      @CurrentUser UUID me, @Valid @RequestBody CreateCrewRequest request) {
    return ApiResponse.of(crewService.create(me, request));
  }

  @GetMapping("/crews/preview")
  public ApiResponse<CrewPreviewResponse> preview(
      @RequestParam @Pattern(regexp = InviteCodes.PATTERN) String inviteCode) {
    return ApiResponse.of(crewService.preview(inviteCode));
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
}
