package site.gachijoopging.server.domain.media.domain.policy;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class MediaSignedUrlTest {

  private static final String SECRET = "test-secret";
  private static final Instant NOW = Instant.parse("2026-11-01T00:00:00Z");
  private static final String KEY = "2026/08/0f3b2c1a-7d4e-4c8b-9a1f-2e5d6c7b8a90.jpg";

  private static final String BASE = "https://media.test";

  private static final long EXPIRES = 1_793_512_800L;

  private final MediaSignedUrl mediaSignedUrl = 서명기(BASE, Duration.ofHours(6));

  @Test
  void Nginx_secure_link_와_같은_서명을_만든다() {
    String url = mediaSignedUrl.of(KEY);

    assertThat(url).isEqualTo(BASE + "/media/" + KEY + "?s=6G7pHprhSydvMccZC_QG2Q&e=" + EXPIRES);
  }

  @Test
  void 스킴부터_시작하는_절대_URL_이다() {
    String url = mediaSignedUrl.of(KEY);

    assertThat(url).startsWith("https://");
  }

  @Test
  void 오리진_끝의_슬래시는_겹치지_않는다() {
    String url = 서명기(BASE + "/", Duration.ofHours(6)).of(KEY);

    assertThat(url).isEqualTo(BASE + "/media/" + KEY + "?s=6G7pHprhSydvMccZC_QG2Q&e=" + EXPIRES);
  }

  @Test
  void 키가_다르면_서명도_다르다() {
    String url = mediaSignedUrl.of("2026/08/0f3b2c1a-7d4e-4c8b-9a1f-2e5d6c7b8a90_thumb.jpg");

    assertThat(url).contains("?s=VmVtv-TvItnl4YOtIMAvAg&e=" + EXPIRES);
  }

  @Test
  void 서명은_base64url_이고_패딩이_없다() {
    String 서명 = 서명만(mediaSignedUrl.of(KEY));

    assertThat(서명).doesNotContain("+", "/", "=");
  }

  @Test
  void 만료는_설정한_TTL_뒤다() {
    MediaSignedUrl 한시간짜리 = 서명기(BASE, Duration.ofHours(1));

    assertThat(한시간짜리.of(KEY)).endsWith("&e=" + NOW.plus(Duration.ofHours(1)).getEpochSecond());
  }

  private static MediaSignedUrl 서명기(String baseUrl, Duration ttl) {
    return new MediaSignedUrl(
        new MediaProperties("/data/uploads", baseUrl, SECRET, ttl),
        Clock.fixed(NOW, ZoneOffset.UTC));
  }

  private static String 서명만(String url) {
    return url.substring(url.indexOf("?s=") + 3, url.indexOf("&e="));
  }
}
