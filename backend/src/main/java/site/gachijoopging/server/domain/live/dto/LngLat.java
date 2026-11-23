package site.gachijoopging.server.domain.live.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

public record LngLat(
    @NotNull @DecimalMin("-180") @DecimalMax("180") Double lng,
    @NotNull @DecimalMin("-90") @DecimalMax("90") Double lat) {}
