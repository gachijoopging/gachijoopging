package site.gachijoopging.server.domain.live.event;

import java.util.UUID;

public record LiveStartedEvent(UUID crewId, UUID userId) {}
