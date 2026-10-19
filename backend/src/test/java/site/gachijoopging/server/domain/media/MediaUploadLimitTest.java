package site.gachijoopging.server.domain.media;

import static org.assertj.core.api.Assertions.assertThat;
import static site.gachijoopging.server.support.TestAccounts.가입한다;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.web.servlet.MockMvc;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts.TestAccount;

// MockMvc 는 서블릿 멀티파트 한도를 거치지 않아, 실제 Tomcat 이 본문을 거절하는 경로는 진짜 포트로만 보인다
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
class MediaUploadLimitTest extends IntegrationTest {

  private static final String 경계 = "----gachijoopging-boundary";

  @LocalServerPort private int port;
  @Autowired private MockMvc mockMvc;

  @Test
  void 서블릿_한도를_넘는_본문도_연결을_끊지_않고_413_봉투다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "upload-limit@test.io");

    HttpResponse<String> 응답 =
        HttpClient.newHttpClient()
            .send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1/media"))
                    .header("Authorization", 나.bearer())
                    .header("Content-Type", "multipart/form-data; boundary=" + 경계)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(본문(15 * 1024 * 1024)))
                    .build(),
                HttpResponse.BodyHandlers.ofString());

    assertThat(응답.statusCode()).isEqualTo(413);
    assertThat(응답.body()).contains("PAYLOAD_TOO_LARGE");
  }

  private static byte[] 본문(int 파일_크기) {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    out.writeBytes(
        ("--%s\r\nContent-Disposition: form-data; name=\"mediaId\"\r\n\r\n%s\r\n"
                + "--%s\r\nContent-Disposition: form-data; name=\"purpose\"\r\n\r\nPOST\r\n"
                + "--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"p.jpg\"\r\n"
                + "Content-Type: image/jpeg\r\n\r\n")
            .formatted(경계, UUID.randomUUID(), 경계, 경계)
            .getBytes(StandardCharsets.UTF_8));
    out.writeBytes(new byte[파일_크기]);
    out.writeBytes(("\r\n--" + 경계 + "--\r\n").getBytes(StandardCharsets.UTF_8));
    return out.toByteArray();
  }
}
