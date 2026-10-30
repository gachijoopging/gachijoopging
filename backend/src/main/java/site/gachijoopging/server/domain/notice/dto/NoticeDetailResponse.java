package site.gachijoopging.server.domain.notice.dto;

import java.time.Instant;
import java.util.List;
import site.gachijoopging.server.domain.post.dto.CommentResponse;

public record NoticeDetailResponse(
    String id,
    String title,
    String preview,
    boolean pinned,
    long commentCount,
    Instant createdAt,
    String body,
    List<CommentResponse> comments) {}
