package site.gachijoopging.server.domain.media.infrastructure.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import site.gachijoopging.server.domain.activity.domain.entity.Category;
import site.gachijoopging.server.domain.media.dto.MediaDtos.InferenceResponse;

class AiInferenceClientTest {

  private static final byte[] 사진 = {(byte) 0xFF, (byte) 0xD8, 0x00};
  private static final String BASE_URL = "http://ai.test:8000";
  private static final String SECRET = "s3cret";

  private MockRestServiceServer server;

  private AiInferenceClient 클라이언트(String baseUrl) {
    RestClient.Builder builder = RestClient.builder();
    server = MockRestServiceServer.bindTo(builder).build();
    return new AiInferenceClient(
        builder.build(), new AiProperties(baseUrl, SECRET, Duration.ofSeconds(3)));
  }

  @Test
  void 정상_응답을_그대로_옮긴다() {
    AiInferenceClient client = 클라이언트(BASE_URL);
    server
        .expect(requestTo(BASE_URL + "/internal/infer"))
        .andExpect(method(HttpMethod.POST))
        .andRespond(
            withSuccess(
                """
                {"modelVersion":"yolo26s-1024-v1","inferenceMs":94,
                 "items":[{"bbox":{"x":0.31,"y":0.44,"w":0.12,"h":0.09},
                           "category":"CIGARETTE","aiConfidence":0.93}]}
                """,
                MediaType.APPLICATION_JSON));

    InferenceResponse 결과 = client.infer(사진);

    assertThat(결과.status()).isEqualTo("OK");
    assertThat(결과.modelVersion()).isEqualTo("yolo26s-1024-v1");
    assertThat(결과.inferenceMs()).isEqualTo(94);
    assertThat(결과.items()).hasSize(1);
    assertThat(결과.items().get(0).category()).isEqualTo(Category.CIGARETTE);
    assertThat(결과.items().get(0).aiConfidence()).isEqualTo(0.93);
    assertThat(결과.items().get(0).bbox().x()).isEqualTo(0.31);
  }

  @Test
  void 아무것도_못_찾아도_OK_다() {
    AiInferenceClient client = 클라이언트(BASE_URL);
    server
        .expect(requestTo(BASE_URL + "/internal/infer"))
        .andRespond(
            withSuccess(
                """
            {"modelVersion":"yolo26s-1024-v1","inferenceMs":21,"items":[]}
            """,
                MediaType.APPLICATION_JSON));

    InferenceResponse 결과 = client.infer(사진);

    assertThat(결과.status()).isEqualTo("OK");
    assertThat(결과.items()).isEmpty();
  }

  @Test
  void 시크릿_헤더를_붙인다() {
    AiInferenceClient client = 클라이언트(BASE_URL);
    server
        .expect(requestTo(BASE_URL + "/internal/infer"))
        .andExpect(header("X-AI-Secret", SECRET))
        .andRespond(withSuccess("{\"items\":[]}", MediaType.APPLICATION_JSON));

    client.infer(사진);

    server.verify();
  }

  @Test
  void _503은_UNAVAILABLE_이다() {
    AiInferenceClient client = 클라이언트(BASE_URL);
    server
        .expect(requestTo(BASE_URL + "/internal/infer"))
        .andRespond(
            withStatus(HttpStatus.SERVICE_UNAVAILABLE)
                .body("{\"code\":\"AI_UNAVAILABLE\"}")
                .contentType(MediaType.APPLICATION_JSON));

    assertThat(client.infer(사진).status()).isEqualTo("UNAVAILABLE");
  }

  @Test
  void _401도_UNAVAILABLE_이다() {
    AiInferenceClient client = 클라이언트(BASE_URL);
    server
        .expect(requestTo(BASE_URL + "/internal/infer"))
        .andRespond(
            withStatus(HttpStatus.UNAUTHORIZED)
                .body("{\"code\":\"UNAUTHORIZED\"}")
                .contentType(MediaType.APPLICATION_JSON));

    assertThat(client.infer(사진).status()).isEqualTo("UNAVAILABLE");
  }

  @Test
  void _500도_UNAVAILABLE_이다() {
    AiInferenceClient client = 클라이언트(BASE_URL);
    server.expect(requestTo(BASE_URL + "/internal/infer")).andRespond(withServerError());

    assertThat(client.infer(사진).status()).isEqualTo("UNAVAILABLE");
  }

  @Test
  void 연결_자체가_안_되면_UNAVAILABLE_이다() {
    AiInferenceClient client = 클라이언트(BASE_URL);
    server
        .expect(requestTo(BASE_URL + "/internal/infer"))
        .andRespond(
            request -> {
              throw new IOException("연결 실패");
            });

    assertThat(client.infer(사진).status()).isEqualTo("UNAVAILABLE");
  }

  @Test
  void 주소가_설정되지_않았으면_부르지도_않고_UNAVAILABLE_이다() {
    AiInferenceClient client = 클라이언트("");

    assertThat(client.infer(사진).status()).isEqualTo("UNAVAILABLE");

    server.verify();
  }

  @Test
  void 모르는_category_는_GENERAL_로_바꾼다() {
    AiInferenceClient client = 클라이언트(BASE_URL);
    server
        .expect(requestTo(BASE_URL + "/internal/infer"))
        .andRespond(
            withSuccess(
                """
            {"items":[{"bbox":{"x":0,"y":0,"w":1,"h":1},"category":"BATTERY","aiConfidence":0.5}]}
            """,
                MediaType.APPLICATION_JSON));

    assertThat(client.infer(사진).items().get(0).category()).isEqualTo(Category.GENERAL);
  }
}
