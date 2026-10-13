package site.gachijoopging.server.domain.activity.dto;

import java.util.UUID;
import site.gachijoopging.server.domain.activity.entity.Category;

public record ItemResponse(
    UUID id,
    UUID photoId,
    Category category,
    int quantity,
    String source,
    Float aiConfidence,
    boolean unclassified,
    Bbox bbox) {}
