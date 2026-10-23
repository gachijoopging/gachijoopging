package site.gachijoopging.server.domain.live.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

// activityId 는 소켓 /app/crew/live 에만 실린다. HTTP 는 경로의 id 를 쓴다
public record ReportLiveRequest(
    UUID activityId,
    @Valid LngLat location,
    @NotNull @Min(0) Integer distanceM,
    @NotNull @Min(0) Integer itemCount,
    @NotNull @Min(0) Integer elapsedSec,
    @NotNull Boolean paused) {}
