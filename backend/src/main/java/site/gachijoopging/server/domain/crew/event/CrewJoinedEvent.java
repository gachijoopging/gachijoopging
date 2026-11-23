package site.gachijoopging.server.domain.crew.event;

import java.util.UUID;

public record CrewJoinedEvent(UUID crewId, UUID leaderId, UUID memberId) {}
