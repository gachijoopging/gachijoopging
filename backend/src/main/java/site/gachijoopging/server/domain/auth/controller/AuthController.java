package site.gachijoopging.server.domain.auth.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.LoginRequest;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.LogoutRequest;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.PasswordResetConfirmRequest;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.PasswordResetRequest;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.RefreshRequest;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.SignupRequest;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.SocialTokenRequest;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.TokenPairResponse;
import site.gachijoopging.server.domain.auth.facade.AuthFacade;
import site.gachijoopging.server.domain.auth.service.AuthService;
import site.gachijoopging.server.global.response.ApiResponse;

@RestController
@RequiredArgsConstructor
@RequestMapping("/auth")
public class AuthController {

  private final AuthService authService;
  private final AuthFacade authFacade;

  @PostMapping("/signup")
  @ResponseStatus(HttpStatus.CREATED)
  public ApiResponse<TokenPairResponse> signup(@Valid @RequestBody SignupRequest request) {
    return ApiResponse.of(
        authService.signup(request.email(), request.password(), request.nickname()));
  }

  @PostMapping("/login")
  public ApiResponse<TokenPairResponse> login(
      @Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
    return ApiResponse.of(
        authFacade.login(request.email(), request.password(), clientIp(httpRequest)));
  }

  @PostMapping("/kakao")
  public ApiResponse<TokenPairResponse> kakao(@Valid @RequestBody SocialTokenRequest request) {
    return ApiResponse.of(authFacade.kakaoLogin(request.token(), request.nickname()));
  }

  @PostMapping("/google")
  public ApiResponse<TokenPairResponse> google(@Valid @RequestBody SocialTokenRequest request) {
    return ApiResponse.of(authFacade.googleLogin(request.token(), request.nickname()));
  }

  @PostMapping("/refresh")
  public ApiResponse<TokenPairResponse> refresh(@Valid @RequestBody RefreshRequest request) {
    return ApiResponse.of(authService.refresh(request.refreshToken()));
  }

  @PostMapping("/logout")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void logout(@RequestBody(required = false) LogoutRequest request) {
    authService.logout(request == null ? null : request.refreshToken());
  }

  @PostMapping("/password-reset")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void passwordReset(
      @Valid @RequestBody PasswordResetRequest request, HttpServletRequest httpRequest) {
    authFacade.requestPasswordReset(request.email(), clientIp(httpRequest));
  }

  @PostMapping("/password-reset/confirm")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void passwordResetConfirm(@Valid @RequestBody PasswordResetConfirmRequest request) {
    authFacade.confirmPasswordReset(request.email(), request.code(), request.newPassword());
  }

  private static String clientIp(HttpServletRequest request) {
    String realIp = request.getHeader("X-Real-IP");
    return realIp == null || realIp.isBlank() ? request.getRemoteAddr() : realIp.trim();
  }
}
