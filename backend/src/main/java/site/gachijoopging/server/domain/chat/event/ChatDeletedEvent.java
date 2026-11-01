package site.gachijoopging.server.domain.chat.event;

import java.util.UUID;

public record ChatDeletedEvent(UUID crewId, long seq) {}
