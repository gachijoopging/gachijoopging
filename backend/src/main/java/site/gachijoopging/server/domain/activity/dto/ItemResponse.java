package site.gachijoopging.server.domain.activity.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;
import site.gachijoopging.server.domain.activity.entity.Category;

public record ItemResponse(
    UUID id,
    @Schema(nullable = true) UUID photoId,
    Category category,
    int quantity,
    @Schema(allowableValues = {"AI", "MANUAL"}) String source,
    @Schema(nullable = true) Float aiConfidence,
    boolean unclassified,
    Bbox bbox) {}
