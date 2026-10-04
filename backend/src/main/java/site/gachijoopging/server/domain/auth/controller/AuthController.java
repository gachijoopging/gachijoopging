package site.gachijoopging.server.domain.auth.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.CredentialsRequest;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.GoogleLoginRequest;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.KakaoLoginRequest;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.LogoutRequest;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.PasswordResetConfirmRequest;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.PasswordResetRequest;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.RefreshRequest;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.SessionResponse;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.TokenPairResponse;
import site.gachijoopging.server.domain.auth.facade.AuthCommandService;
import site.gachijoopging.server.domain.auth.service.AuthService;
import site.gachijoopging.server.domain.auth.service.PasswordResetService;
import site.gachijoopging.server.global.response.ApiResponse;

@RestController
@RequiredArgsConstructor
@RequestMapping("/auth")
public class AuthController {

  private final AuthService authService;
  private final AuthCommandService authCommandService;
  private final PasswordResetService passwordResetService;

  @PostMapping("/signup")
  public ApiResponse<SessionResponse> signup(@Valid @RequestBody CredentialsRequest request) {
    return ApiResponse.of(authService.signup(request.email(), request.password()));
  }

  @PostMapping("/login")
  public ApiResponse<SessionResponse> login(@Valid @RequestBody CredentialsRequest request) {
    return ApiResponse.of(authService.login(request.email(), request.password()));
  }

  @PostMapping("/kakao")
  public ApiResponse<SessionResponse> kakao(@Valid @RequestBody KakaoLoginRequest request) {
    return ApiResponse.of(authCommandService.kakaoLogin(request.kakaoAccessToken()));
  }

  @PostMapping("/google")
  public ApiResponse<SessionResponse> google(@Valid @RequestBody GoogleLoginRequest request) {
    return ApiResponse.of(authCommandService.googleLogin(request.idToken()));
  }

  @PostMapping("/refresh")
  public ApiResponse<TokenPairResponse> refresh(@Valid @RequestBody RefreshRequest request) {
    return ApiResponse.of(authService.refresh(request.refreshToken()));
  }

  @PostMapping("/logout")
  public ApiResponse<Map<String, Object>> logout(
      @RequestBody(required = false) LogoutRequest request) {
    authService.logout(request == null ? null : request.refreshToken());
    return ApiResponse.of(Map.of());
  }

  @PostMapping("/password-reset")
  @ResponseStatus(HttpStatus.ACCEPTED)
  public void passwordReset(
      @Valid @RequestBody PasswordResetRequest request, HttpServletRequest httpRequest) {
    passwordResetService.request(request.email(), clientIp(httpRequest));
  }

  @PostMapping("/password-reset/confirm")
  public ApiResponse<Map<String, Object>> passwordResetConfirm(
      @Valid @RequestBody PasswordResetConfirmRequest request) {
    passwordResetService.confirm(request.token(), request.newPassword());
    return ApiResponse.of(Map.of());
  }

  private static String clientIp(HttpServletRequest request) {
    String realIp = request.getHeader("X-Real-IP");
    return realIp == null || realIp.isBlank() ? request.getRemoteAddr() : realIp.trim();
  }
}
