package site.gachijoopging.server.domain.activity.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record ActivityResponse(
    UUID id,
    String status,
    Instant startedAt,
    Instant endedAt,
    int durationSec,
    int pausedSec,
    boolean paused,
    Instant pausedAt,
    int distanceM,
    Integer steps,
    boolean locationShared,
    int itemCount,
    Map<String, Integer> byCategory,
    List<ItemResponse> items) {}
