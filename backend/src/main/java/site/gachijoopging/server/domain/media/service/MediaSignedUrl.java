package site.gachijoopging.server.domain.media.service;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

@Component
public class MediaSignedUrl {

  private static final String URI_PREFIX = "/media/";
  private static final String ALGORITHM = "HmacSHA256";

  private final MediaProperties properties;
  private final Clock clock;

  private final String origin;
  private final SecretKeySpec key;

  public MediaSignedUrl(MediaProperties properties, Clock clock) {
    this.properties = properties;
    this.clock = clock;
    this.origin = properties.baseUrl().replaceAll("/+$", "");
    this.key =
        new SecretKeySpec(
            properties.secureLinkSecret().getBytes(StandardCharsets.UTF_8), ALGORITHM);
  }

  public String of(String key) {
    String uri = URI_PREFIX + key;
    long expires = Instant.now(clock).plus(properties.signedUrlTtl()).getEpochSecond();
    return origin + uri + "?s=" + signature(expires, uri) + "&e=" + expires;
  }

  // 검증은 Nginx 의 infra/nginx/media_link.js 가 한다. 식이 한 글자만 달라도 모든 사진이 403 이 된다
  private String signature(long expires, String uri) {
    try {
      Mac mac = Mac.getInstance(ALGORITHM);
      mac.init(key);
      byte[] hash = mac.doFinal((expires + uri).getBytes(StandardCharsets.UTF_8));
      return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
    } catch (GeneralSecurityException e) {
      throw new IllegalStateException("HmacSHA256 을 쓸 수 없다", e);
    }
  }
}
