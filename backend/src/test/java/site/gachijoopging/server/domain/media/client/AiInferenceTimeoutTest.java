package site.gachijoopging.server.domain.media.client;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.time.Duration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import site.gachijoopging.server.domain.media.infrastructure.client.AiClientConfig;
import site.gachijoopging.server.domain.media.infrastructure.client.AiInferenceClient;
import site.gachijoopging.server.domain.media.infrastructure.client.AiProperties;

class AiInferenceTimeoutTest {

  private static final Duration TIMEOUT = Duration.ofMillis(300);
  private static final Duration 서버가_기다리는_시간 = Duration.ofSeconds(5);

  private HttpServer 느린_서버;

  @BeforeEach
  void 느린_서버를_띄운다() throws IOException {
    느린_서버 = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    느린_서버.createContext(
        "/internal/infer",
        exchange -> {
          try {
            Thread.sleep(서버가_기다리는_시간.toMillis());
          } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
          }
          exchange.sendResponseHeaders(200, -1);
          exchange.close();
        });
    느린_서버.start();
  }

  @AfterEach
  void 서버를_내린다() {
    느린_서버.stop(0);
  }

  @Test
  void 타임아웃이_지나면_기다리지_않고_UNAVAILABLE_이다() {
    AiProperties properties =
        new AiProperties("http://127.0.0.1:" + 느린_서버.getAddress().getPort(), "s3cret", TIMEOUT);
    AiInferenceClient client =
        new AiInferenceClient(new AiClientConfig().aiRestClient(properties), properties);

    long 시작 = System.nanoTime();
    String status = client.infer(new byte[] {(byte) 0xFF, (byte) 0xD8}).status();
    Duration 걸린_시간 = Duration.ofNanos(System.nanoTime() - 시작);

    assertThat(status).isEqualTo("UNAVAILABLE");
    assertThat(걸린_시간).isLessThan(Duration.ofSeconds(2));
  }
}
