package site.gachijoopging.server.domain.crew.event;

import java.util.UUID;

public record JoinRequestedEvent(UUID requestId, UUID crewId, UUID leaderId, UUID applicantId) {}
