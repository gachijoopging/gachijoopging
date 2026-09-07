package site.gachijoopging.server.domain.auth.api.controller;

import jakarta.validation.Valid;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.domain.auth.application.command.AuthCommandService;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.SocialLinkRequest;
import site.gachijoopging.server.global.response.ApiResponse;
import site.gachijoopging.server.global.security.CurrentUser;

@RestController
@RequiredArgsConstructor
public class SocialLinkController {

  private final AuthCommandService authCommandService;

  @PostMapping("/users/me/social")
  public ApiResponse<Map<String, Object>> link(
      @CurrentUser UUID me, @Valid @RequestBody SocialLinkRequest request) {
    authCommandService.linkSocial(me, request.provider(), request.token());
    return ApiResponse.of(Map.of());
  }
}
