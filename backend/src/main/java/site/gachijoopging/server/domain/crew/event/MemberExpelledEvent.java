package site.gachijoopging.server.domain.crew.event;

import java.util.UUID;

public record MemberExpelledEvent(UUID crewId, UUID userId, UUID expelledBy) {}
