package site.gachijoopging.server.domain.notice.dto;

import java.time.Instant;
import java.util.UUID;

public record LatestNotice(UUID id, String title, Instant createdAt) {}
