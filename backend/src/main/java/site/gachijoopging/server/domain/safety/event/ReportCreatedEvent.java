package site.gachijoopging.server.domain.safety.event;

import java.util.UUID;

public record ReportCreatedEvent(UUID crewId, UUID reportId, UUID reporterId) {}
