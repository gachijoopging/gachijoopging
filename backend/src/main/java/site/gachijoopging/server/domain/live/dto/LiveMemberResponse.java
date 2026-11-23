package site.gachijoopging.server.domain.live.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;

public record LiveMemberResponse(
    UserBriefResponse user,
    String activityId,
    Instant startedAt,
    int elapsedSec,
    int distanceM,
    int itemCount,
    boolean paused,
    boolean locationShared,
    @Schema(nullable = true) LngLat location) {}
