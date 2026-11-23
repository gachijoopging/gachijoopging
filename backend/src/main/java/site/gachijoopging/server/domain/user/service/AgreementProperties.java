package site.gachijoopging.server.domain.user.service;

import java.util.stream.Stream;
import org.springframework.boot.context.properties.ConfigurationProperties;
import site.gachijoopging.server.domain.user.entity.AgreementType;

@ConfigurationProperties("app.agreements")
public record AgreementProperties(
    String version, String termsUrl, String privacyUrl, String marketingUrl) {

  public boolean configured() {
    return Stream.of(version, termsUrl, privacyUrl, marketingUrl)
        .allMatch(v -> v != null && !v.isBlank());
  }

  public String url(AgreementType type) {
    return switch (type) {
      case TERMS -> termsUrl;
      case PRIVACY -> privacyUrl;
      case MARKETING -> marketingUrl;
    };
  }
}
