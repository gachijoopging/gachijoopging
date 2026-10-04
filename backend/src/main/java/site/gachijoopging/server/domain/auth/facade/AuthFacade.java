package site.gachijoopging.server.domain.auth.facade;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import site.gachijoopging.server.domain.auth.client.GoogleAuthClient;
import site.gachijoopging.server.domain.auth.client.KakaoAuthClient;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.SessionResponse;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.SocialProvider;
import site.gachijoopging.server.domain.auth.service.AuthService;
import site.gachijoopging.server.domain.user.service.UserService;

@Service
@RequiredArgsConstructor
public class AuthFacade {

  private final KakaoAuthClient kakaoAuthClient;
  private final GoogleAuthClient googleAuthClient;
  private final AuthService authService;
  private final UserService userService;

  public SessionResponse kakaoLogin(String kakaoAccessToken) {
    return authService.kakaoSession(kakaoAuthClient.verify(kakaoAccessToken));
  }

  public SessionResponse googleLogin(String idToken) {
    return authService.googleSession(googleAuthClient.verify(idToken));
  }

  public void linkSocial(UUID me, SocialProvider provider, String token) {
    switch (provider) {
      case KAKAO -> userService.linkKakao(me, kakaoAuthClient.verify(token));
      case GOOGLE -> userService.linkGoogle(me, googleAuthClient.verify(token));
    }
  }
}
