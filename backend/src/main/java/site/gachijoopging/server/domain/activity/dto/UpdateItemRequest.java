package site.gachijoopging.server.domain.activity.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import site.gachijoopging.server.domain.activity.entity.Category;

public record UpdateItemRequest(Category category, @Min(1) @Max(999) Integer quantity) {}
