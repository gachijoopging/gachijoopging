package site.gachijoopging.server.domain.media.event;

import java.util.List;

public record MediaPurgeEvent(List<String> keys) {}
