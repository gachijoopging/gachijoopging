package site.gachijoopging.server.domain.auth.facade;

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
import site.gachijoopging.server.domain.user.service.UserService;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
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
