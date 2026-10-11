package site.gachijoopging.server.domain.media.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import site.gachijoopging.server.domain.activity.entity.Category;

public final class MediaDtos {

  private MediaDtos() {}

  public record MediaUploadResponse(
      String mediaId, String url, String thumbUrl, InferenceResponse inference) {}

  public record InferenceResponse(
      @Schema(allowableValues = {"OK", "UNAVAILABLE"}) String status,
      @Schema(nullable = true) String modelVersion,
      @Schema(nullable = true) Integer inferenceMs,
      @Schema(nullable = true) List<InferenceItemResponse> items) {

    private static final String OK = "OK";
    private static final String UNAVAILABLE = "UNAVAILABLE";

    public static InferenceResponse ok(
        String modelVersion, Integer inferenceMs, List<InferenceItemResponse> items) {
      return new InferenceResponse(OK, modelVersion, inferenceMs, items);
    }

    public static InferenceResponse unavailable() {
      return new InferenceResponse(UNAVAILABLE, null, null, null);
    }
  }

  public record InferenceItemResponse(BboxResponse bbox, Category category, double aiConfidence) {}

  public record BboxResponse(double x, double y, double w, double h) {}
}
