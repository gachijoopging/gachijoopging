package site.gachijoopging.server.global.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.Duration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.ResourceAccessException;

class KakaoLocalTimeoutTest {

  private static final Duration TIMEOUT = Duration.ofMillis(300);
  private static final Duration 카카오가_기다리는_시간 = Duration.ofSeconds(5);

  private HttpServer 느린_카카오;

  @BeforeEach
  void 느린_카카오를_띄운다() throws IOException {
    느린_카카오 = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    느린_카카오.createContext(
        "/v2/local/geo/coord2regioncode.json",
        exchange -> {
          try {
            Thread.sleep(카카오가_기다리는_시간.toMillis());
          } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
          }
          exchange.sendResponseHeaders(200, -1);
          exchange.close();
        });
    느린_카카오.start();
  }

  @AfterEach
  void 서버를_내린다() {
    느린_카카오.stop(0);
  }

  private static final String ASCII_키 = "test-rest-key";

  @Test
  void 타임아웃이_지나면_기다리지_않는다() {
    KakaoLocalProperties properties =
        new KakaoLocalProperties(
            "http://127.0.0.1:" + 느린_카카오.getAddress().getPort(), ASCII_키, TIMEOUT);
    KakaoLocalClient client =
        new KakaoLocalClient(new KakaoLocalClientConfig().kakaoLocalRestClient(properties));

    long 시작 = System.nanoTime();
    assertThatThrownBy(() -> client.findRegion(37.5006, 127.0364))
        .isInstanceOf(ResourceAccessException.class);
    Duration 걸린_시간 = Duration.ofNanos(System.nanoTime() - 시작);

    assertThat(걸린_시간).isLessThan(Duration.ofSeconds(2));
  }
}
