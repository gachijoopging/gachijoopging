package site.gachijoopging.server.domain.activity.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;
import site.gachijoopging.server.domain.activity.entity.Category;

public record ItemInput(
    @NotNull UUID id,
    @NotNull Category category,
    @NotNull @Min(1) @Max(999) Integer quantity,
    Category aiPredictedCategory,
    Float aiConfidence,
    @Valid Bbox bbox) {}
