package site.gachijoopging.server.domain.crew.event;

import java.util.UUID;

public record MemberLeftEvent(UUID crewId, UUID userId) {}
