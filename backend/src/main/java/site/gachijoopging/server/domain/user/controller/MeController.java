package site.gachijoopging.server.domain.user.controller;

import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.domain.user.dto.DeviceRequest;
import site.gachijoopging.server.domain.user.dto.MeResponse;
import site.gachijoopging.server.domain.user.dto.MeUpdateRequest;
import site.gachijoopging.server.domain.user.service.UserService;
import site.gachijoopging.server.global.response.ApiResponse;
import site.gachijoopging.server.global.security.CurrentUser;

@RestController
@RequiredArgsConstructor
public class MeController {

  private final UserService userService;

  @GetMapping("/users/me")
  public ApiResponse<MeResponse> get(@CurrentUser UUID me) {
    return ApiResponse.of(userService.getMe(me));
  }

  @PatchMapping("/users/me")
  public ApiResponse<MeResponse> update(
      @CurrentUser UUID me, @Valid @RequestBody MeUpdateRequest request) {
    return ApiResponse.of(userService.updateMe(me, request));
  }

  @DeleteMapping("/users/me")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void withdraw(@CurrentUser UUID me) {
    userService.withdraw(me);
  }

  @PutMapping("/users/me/devices")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void registerDevice(@CurrentUser UUID me, @Valid @RequestBody DeviceRequest request) {
    userService.registerDevice(me, request);
  }

  @PutMapping("/users/{userId}/follow")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void follow(@CurrentUser UUID me, @PathVariable UUID userId) {
    userService.follow(me, userId);
  }

  @DeleteMapping("/users/{userId}/follow")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void unfollow(@CurrentUser UUID me, @PathVariable UUID userId) {
    userService.unfollow(me, userId);
  }
}
