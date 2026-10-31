package site.gachijoopging.server.domain.post.event;

import java.util.UUID;

public record CommentCreatedEvent(UUID postId, UUID postAuthorId, UUID commentId, UUID authorId) {}
