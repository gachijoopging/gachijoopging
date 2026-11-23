package site.gachijoopging.server.domain.crew.event;

import java.util.UUID;

public record JoinRequestDecidedEvent(
    UUID requestId, UUID crewId, UUID applicantId, boolean approved) {}
