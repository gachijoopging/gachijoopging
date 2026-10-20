package site.gachijoopging.server.domain.activity.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

public record ActivityCardResponse(
    UUID id,
    Instant startedAt,
    int durationSec,
    int distanceM,
    int itemCount,
    @Schema(nullable = true) String thumbUrl) {}
