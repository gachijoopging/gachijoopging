package site.gachijoopging.server.domain.activity.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;

public record ActivityResponse(
    UUID id,
    UserBriefResponse user,
    @Schema(allowableValues = {"IN_PROGRESS", "ENDED"}) String status,
    Instant startedAt,
    @Schema(nullable = true) Instant endedAt,
    int durationSec,
    int pausedSec,
    boolean paused,
    @Schema(nullable = true) Instant pausedAt,
    int distanceM,
    @Schema(nullable = true) Integer steps,
    boolean locationShared,
    int itemCount,
    Map<String, Integer> byCategory,
    @Schema(nullable = true) List<List<Double>> route,
    List<PhotoResponse> photos,
    List<ItemResponse> items) {}
