package site.gachijoopging.server.domain.user.domain.service;

import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import site.gachijoopging.server.domain.user.dto.MeResponse;
import site.gachijoopging.server.domain.user.dto.UserAccount;

// ponytail: 시그니처만 있다. user 도메인 본체가 들어오기 전에는 호출되면 실패한다
@Service
public class UserService {

  public UserAccount create(String email, String password) {
    throw notYet();
  }

  public Optional<UserAccount> authenticate(String email, String password) {
    throw notYet();
  }

  public UserAccount findOrCreateByKakaoId(String kakaoId) {
    throw notYet();
  }

  public UserAccount findOrCreateByGoogleSub(String googleSub) {
    throw notYet();
  }

  public void linkKakao(UUID userId, String kakaoId) {
    throw notYet();
  }

  public void linkGoogle(UUID userId, String googleSub) {
    throw notYet();
  }

  public void requireUsable(UUID userId) {
    throw notYet();
  }

  public MeResponse getMe(UUID userId) {
    throw notYet();
  }

  public Optional<UUID> findPasswordOwnerId(String email) {
    throw notYet();
  }

  public void changePassword(UUID userId, String newPassword) {
    throw notYet();
  }

  private static UnsupportedOperationException notYet() {
    return new UnsupportedOperationException("user 도메인이 아직 없다");
  }
}
