package site.gachijoopging.server.domain.activity.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

public record EndActivityRequest(
    @NotNull Instant endedAt,
    @NotNull @Min(0) Integer durationSec,
    @NotNull @Min(0) Integer pausedSec,
    @NotNull @Min(0) Integer distanceM,
    @Min(0) Integer steps,
    @NotNull List<@NotNull @Size(min = 2, max = 2) List<@NotNull Double>> route) {}
