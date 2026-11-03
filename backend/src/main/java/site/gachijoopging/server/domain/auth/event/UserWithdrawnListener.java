package site.gachijoopging.server.domain.auth.event;

import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.auth.service.AuthService;
import site.gachijoopging.server.domain.auth.service.PasswordResetService;
import site.gachijoopging.server.domain.user.event.UserWithdrawnEvent;

// auth 가 user 를 주입하므로 user 가 auth 를 부르면 순환한다. 탈퇴 트랜잭션 안에서 받아 함께 커밋된다
@Component
@RequiredArgsConstructor
public class UserWithdrawnListener {

  private final AuthService authService;
  private final PasswordResetService passwordResetService;

  @EventListener
  public void onUserWithdrawn(UserWithdrawnEvent event) {
    authService.withdraw(event.userId());
    passwordResetService.withdraw(event.userId());
  }
}
