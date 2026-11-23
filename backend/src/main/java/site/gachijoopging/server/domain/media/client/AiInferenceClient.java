package site.gachijoopging.server.domain.media.client;

import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import site.gachijoopging.server.domain.activity.entity.Category;
import site.gachijoopging.server.domain.media.dto.MediaDtos.BboxResponse;
import site.gachijoopging.server.domain.media.dto.MediaDtos.InferenceItemResponse;
import site.gachijoopging.server.domain.media.dto.MediaDtos.InferenceResponse;

@Component
@Slf4j
public class AiInferenceClient {

  private static final String PATH = "/internal/infer";
  private static final String SECRET_HEADER = "X-AI-Secret";

  private static final Category FALLBACK_CATEGORY = Category.GENERAL;

  private final RestClient restClient;
  private final AiProperties properties;

  public AiInferenceClient(RestClient aiRestClient, AiProperties properties) {
    this.properties = properties;
    this.restClient = aiRestClient;
  }

  public InferenceResponse infer(byte[] jpeg) {
    if (!properties.configured()) {
      log.warn("AI 서버 주소가 없다 (app.ai.base-url) — 추론을 건너뛴다");
      return InferenceResponse.unavailable();
    }

    long start = System.nanoTime();
    try {
      InferResult response =
          restClient
              .post()
              .uri(properties.baseUrl() + PATH)
              .header(SECRET_HEADER, properties.secret())
              .contentType(MediaType.MULTIPART_FORM_DATA)
              .body(text(jpeg))
              .retrieve()
              .body(InferResult.class);

      if (response == null) {
        log.warn("AI 서버가 빈 본문을 줬다");
        return InferenceResponse.unavailable();
      }
      roundTripLog(start, response.inferenceMs());
      return InferenceResponse.ok(
          response.modelVersion(), response.inferenceMs(), items(response.items()));
    } catch (Exception e) {
      log.warn("AI 추론 실패 — UNAVAILABLE 로 내린다: {}", e.toString());
      return InferenceResponse.unavailable();
    }
  }

  private static void roundTripLog(long start, Integer inferenceMs) {
    long roundTrip = (System.nanoTime() - start) / 1_000_000;
    if (inferenceMs == null) {
      log.info("AI 왕복 {}ms (inferenceMs 없음)", roundTrip);
      return;
    }
    log.info("AI 왕복 {}ms · 추론 {}ms · 차이 {}ms", roundTrip, inferenceMs, roundTrip - inferenceMs);
  }

  private static Object text(byte[] jpeg) {
    MultipartBodyBuilder builder = new MultipartBodyBuilder();
    builder
        .part("file", new ByteArrayResource(jpeg))
        .filename("photo.jpg")
        .contentType(MediaType.IMAGE_JPEG);
    return builder.build();
  }

  private static List<InferenceItemResponse> items(List<InferItem> items) {
    if (items == null) {
      return List.of();
    }
    return items.stream()
        .map(
            it ->
                new InferenceItemResponse(
                    it.bbox(), knownCategories(it.category()), it.aiConfidence()))
        .toList();
  }

  private static Category knownCategories(String category) {
    return Category.from(category)
        .orElseGet(
            () -> {
              log.warn("AI 가 계약에 없는 분류를 줬다 — GENERAL 로 바꾼다: {}", category);
              return FALLBACK_CATEGORY;
            });
  }

  private record InferResult(String modelVersion, Integer inferenceMs, List<InferItem> items) {}

  private record InferItem(BboxResponse bbox, String category, double aiConfidence) {}
}
