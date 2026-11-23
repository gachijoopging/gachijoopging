package site.gachijoopging.server.domain.user.dto;

import java.util.List;
import site.gachijoopging.server.domain.user.entity.AgreementType;

public record AgreementCatalogResponse(List<CatalogItem> items) {

  public record CatalogItem(AgreementType type, String version, boolean required, String url) {}
}
