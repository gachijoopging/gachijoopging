package site.gachijoopging.server.domain.user.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import site.gachijoopging.server.domain.user.entity.AgreementType;

public record AgreementsResponse(boolean complete, List<AgreementItem> items) {

  public record AgreementItem(
      AgreementType type,
      String version,
      boolean required,
      String url,
      boolean agreed,
      @Schema(nullable = true) Instant agreedAt) {}
}
