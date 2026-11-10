package site.gachijoopging.server.domain.media.event;

import java.util.List;
import java.util.UUID;

public record MediaReleasedEvent(List<UUID> mediaIds) {}
