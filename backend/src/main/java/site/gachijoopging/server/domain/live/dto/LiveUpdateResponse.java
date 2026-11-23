package site.gachijoopging.server.domain.live.dto;

public record LiveUpdateResponse(
    String userId,
    boolean locationShared,
    LngLat location,
    int distanceM,
    int itemCount,
    int elapsedSec,
    boolean paused) {}
