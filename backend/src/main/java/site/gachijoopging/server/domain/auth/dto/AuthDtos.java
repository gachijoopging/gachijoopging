package site.gachijoopging.server.domain.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.hibernate.validator.constraints.CodePointLength;

public final class AuthDtos {

  private AuthDtos() {}

  public record SignupRequest(
      @NotBlank @Email String email,
      @NotBlank @Size(min = 8) String password,
      @NotBlank @CodePointLength(min = 2, max = 12) String nickname) {

    public SignupRequest {
      nickname = normalizeNickname(nickname);
    }
  }

  // 길이·형식을 검증하면 422 와 401 이 갈려 계정 상태가 드러난다 — 계약도 검증하지 않는다
  public record LoginRequest(@NotNull String email, @NotNull String password) {}

  public record SocialTokenRequest(
      @NotBlank String token, @CodePointLength(min = 2, max = 12) String nickname) {

    public SocialTokenRequest {
      nickname = normalizeNickname(nickname);
    }
  }

  public enum SocialProvider {
    KAKAO,
    GOOGLE
  }

  public record SocialLinkRequest(@NotNull SocialProvider provider, @NotBlank String token) {}

  public record TokenPairResponse(String accessToken, String refreshToken, boolean isNew) {}

  public record RefreshRequest(@NotBlank String refreshToken) {}

  public record LogoutRequest(String refreshToken) {}

  public record PasswordResetRequest(@NotBlank @Email String email) {}

  // code 형식을 여기서 막으면 fields 없는 422 가 되어 앱이 코드 칸에 오류를 붙이지 못한다
  public record PasswordResetConfirmRequest(
      @NotNull String email, @NotNull String code, @NotBlank @Size(min = 8) String newPassword) {}

  private static String normalizeNickname(String nickname) {
    return nickname == null ? null : nickname.replace("\r", "").replace("\n", "").strip();
  }
}
