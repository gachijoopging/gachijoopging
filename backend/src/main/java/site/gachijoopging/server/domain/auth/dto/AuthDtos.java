package site.gachijoopging.server.domain.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import site.gachijoopging.server.domain.user.dto.MeResponse;

public final class AuthDtos {

  private AuthDtos() {}

  public record CredentialsRequest(
      @NotBlank @Email String email, @NotBlank @Size(min = 8) String password) {}

  public record KakaoLoginRequest(@NotBlank String kakaoAccessToken) {}

  public record GoogleLoginRequest(@NotBlank String idToken) {}

  public enum SocialProvider {
    KAKAO,
    GOOGLE
  }

  public record SocialLinkRequest(@NotNull SocialProvider provider, @NotBlank String token) {}

  public record TokenPairResponse(String accessToken, String refreshToken) {}

  public record SessionResponse(
      String accessToken, String refreshToken, boolean onboardingRequired, MeResponse user) {}

  public record RefreshRequest(@NotBlank String refreshToken) {}

  public record LogoutRequest(String refreshToken) {}

  public record PasswordResetRequest(@NotBlank @Email String email) {}

  public record PasswordResetConfirmRequest(
      @NotBlank String token, @NotBlank @Size(min = 8) String newPassword) {}
}
