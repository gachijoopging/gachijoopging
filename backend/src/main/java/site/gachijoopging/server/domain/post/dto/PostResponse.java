package site.gachijoopging.server.domain.post.dto;

import java.time.Instant;
import java.util.List;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;
import site.gachijoopging.server.domain.post.entity.PostVisibility;

public record PostResponse(
    String id,
    UserBriefResponse author,
    String text,
    PostVisibility visibility,
    List<PostMediaResponse> media,
    long likeCount,
    boolean liked,
    long commentCount,
    Instant createdAt) {}
