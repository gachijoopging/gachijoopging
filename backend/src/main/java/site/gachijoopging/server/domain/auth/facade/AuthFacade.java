package site.gachijoopging.server.domain.auth.facade;

import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import site.gachijoopging.server.domain.auth.client.GoogleAuthClient;
import site.gachijoopging.server.domain.auth.client.KakaoAuthClient;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.SocialProvider;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.TokenPairResponse;
import site.gachijoopging.server.domain.auth.service.AuthService;
import site.gachijoopging.server.domain.auth.service.LoginRateLimitProperties;
import site.gachijoopging.server.domain.auth.service.OpaqueToken;
import site.gachijoopging.server.domain.auth.service.PasswordResetMailSender;
import site.gachijoopging.server.domain.auth.service.PasswordResetProperties;
import site.gachijoopging.server.domain.auth.service.PasswordResetService;
import site.gachijoopging.server.domain.user.service.UserService;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.error.ErrorField;
import site.gachijoopging.server.global.ratelimit.RateLimiter;

@Service
@RequiredArgsConstructor
public class AuthFacade {

  private final KakaoAuthClient kakaoAuthClient;
  private final GoogleAuthClient googleAuthClient;
  private final AuthService authService;
  private final UserService userService;
  private final RateLimiter rateLimiter;
  private final LoginRateLimitProperties loginRateLimit;
  private final PasswordResetService passwordResetService;
  private final PasswordResetMailSender passwordResetMailSender;
  private final PasswordResetProperties passwordReset;

  // Redis 를 기다리는 동안 DB 커넥션을 잡지 않도록 트랜잭션 밖에서 센다
  public TokenPairResponse login(String email, String password, String clientIp) {
    boolean emailOk =
        rateLimiter.tryAcquire(
            "login:email:" + OpaqueToken.hash(email),
            loginRateLimit.perEmail(),
            loginRateLimit.window());
    boolean ipOk =
        rateLimiter.tryAcquire(
            "login:ip:" + clientIp, loginRateLimit.perIp(), loginRateLimit.window());
    if (!emailOk || !ipOk) {
      throw new BusinessException(
          ErrorCode.RATE_LIMITED, "로그인 시도가 너무 잦다", loginRateLimit.window().toSeconds());
    }
    return authService.login(email, password);
  }

  // 제한은 계정을 찾기 전에 건다 — 없는 이메일도 같은 응답을 받아야 가입 여부가 드러나지 않는다.
  // IP 로 막힐 요청이 진짜 주인의 60초 창을 써 버리지 않게 IP 를 먼저 본다
  public void requestPasswordReset(String email, String clientIp) {
    if (!rateLimiter.tryAcquire(
        "pwreset:ip:" + clientIp, passwordReset.perIpLimit(), passwordReset.perIpWindow())) {
      throw new BusinessException(
          ErrorCode.RATE_LIMITED,
          "한 IP 에서 재설정 메일을 너무 많이 요청했다",
          passwordReset.perIpWindow().toSeconds());
    }
    if (!rateLimiter.tryAcquire(
        "pwreset:email:" + OpaqueToken.hash(email), 1, passwordReset.resendInterval())) {
      throw new BusinessException(
          ErrorCode.RATE_LIMITED,
          "같은 이메일로 재설정 메일을 너무 자주 요청했다",
          passwordReset.resendInterval().toSeconds());
    }
    passwordResetService.issue(email).ifPresent(code -> passwordResetMailSender.send(email, code));
  }

  public void confirmPasswordReset(String email, String code, String newPassword) {
    if (!passwordResetService.confirm(email, code, newPassword)) {
      throw new BusinessException(
          ErrorCode.VALIDATION, "쓸 수 없는 재설정 코드다", List.of(new ErrorField("code", "INVALID")));
    }
  }

  public TokenPairResponse kakaoLogin(String accessToken, String nickname) {
    return authService.kakaoSession(kakaoAuthClient.verify(accessToken), nickname);
  }

  public TokenPairResponse googleLogin(String idToken, String nickname) {
    return authService.googleSession(googleAuthClient.verify(idToken), nickname);
  }

  public void linkSocial(UUID me, SocialProvider provider, String token) {
    switch (provider) {
      case KAKAO -> userService.linkKakao(me, kakaoAuthClient.verify(token));
      case GOOGLE -> userService.linkGoogle(me, googleAuthClient.verify(token));
    }
  }
}
