package site.gachijoopging.server.domain.notice.dto;

import java.time.Instant;

public record NoticeResponse(
    String id,
    String title,
    String preview,
    boolean pinned,
    long commentCount,
    Instant createdAt) {}
