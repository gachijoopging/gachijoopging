package site.gachijoopging.server.domain.post.dto;

import java.time.Instant;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;

public record CommentResponse(
    String id, UserBriefResponse author, String text, Instant createdAt) {}
