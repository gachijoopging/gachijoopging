package site.gachijoopging.server.domain.post.event;

import java.util.UUID;

/** 작성자가 아닌 사람(크루장)이 지웠을 때만 난다. */
public record PostRemovedEvent(UUID postId) {}
