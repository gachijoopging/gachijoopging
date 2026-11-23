package site.gachijoopging.server.domain.live.event;

import java.util.UUID;

public record LiveEndedEvent(UUID crewId, UUID userId, UUID activityId) {}
