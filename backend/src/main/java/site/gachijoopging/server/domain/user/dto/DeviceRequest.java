package site.gachijoopging.server.domain.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record DeviceRequest(@NotBlank String pushToken, @NotNull Platform platform) {

  public enum Platform {
    ANDROID
  }
}
