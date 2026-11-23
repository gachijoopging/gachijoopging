package site.gachijoopging.server.domain.live.event;

import java.util.UUID;
import site.gachijoopging.server.domain.live.dto.LiveUpdateResponse;

public record LiveUpdatedEvent(
    UUID crewId, UUID userId, UUID activityId, LiveUpdateResponse update) {}
