package site.gachijoopging.server.domain.media.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import org.springframework.stereotype.Component;

@Component
public class MediaSignedUrl {

  private static final String URI_PREFIX = "/media/";

  private final MediaProperties properties;
  private final Clock clock;

  private final String origin;

  public MediaSignedUrl(MediaProperties properties, Clock clock) {
    this.properties = properties;
    this.clock = clock;
    this.origin = properties.baseUrl().replaceAll("/+$", "");
  }

  public String of(String key) {
    String uri = URI_PREFIX + key;
    long expires = Instant.now(clock).plus(properties.signedUrlTtl()).getEpochSecond();
    return origin + uri + "?s=" + signature(expires, uri) + "&e=" + expires;
  }

  private String signature(long expires, String uri) {
    String raw = expires + uri + " " + properties.secureLinkSecret();
    byte[] hash = md5(raw.getBytes(StandardCharsets.UTF_8));
    return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
  }

  // nginx secure_link_md5 가 MD5 만 지원한다. 다른 해시로 바꾸면 nginx 검증이 전부 403 이 된다.
  private static byte[] md5(byte[] raw) {
    try {
      return MessageDigest.getInstance("MD5").digest(raw);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("MD5 를 쓸 수 없다", e);
    }
  }
}
