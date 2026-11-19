package site.gachijoopging.server.domain.media.client;

import java.time.Instant;

public record StoredFile(String key, Instant modifiedAt) {}
