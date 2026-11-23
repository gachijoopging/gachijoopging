package site.gachijoopging.server.domain.activity.dto;

import java.time.Instant;
import java.util.UUID;

public record PhotoResponse(UUID id, String url, String thumbUrl, Instant takenAt) {}
