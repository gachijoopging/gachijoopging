package site.gachijoopging.server.domain.media.event;

import java.util.List;

public record MediaQuarantineEvent(List<String> keys) {}
