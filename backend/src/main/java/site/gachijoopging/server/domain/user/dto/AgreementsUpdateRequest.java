package site.gachijoopging.server.domain.user.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import site.gachijoopging.server.domain.user.entity.AgreementType;

public record AgreementsUpdateRequest(@NotNull List<@Valid @NotNull Item> items) {

  public record Item(
      @NotNull AgreementType type, @NotNull String version, @NotNull Boolean agreed) {}
}
