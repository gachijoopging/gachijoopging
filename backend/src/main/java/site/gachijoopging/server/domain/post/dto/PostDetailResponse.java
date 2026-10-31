package site.gachijoopging.server.domain.post.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;
import site.gachijoopging.server.domain.post.entity.PostVisibility;

public record PostDetailResponse(
    String id,
    UserBriefResponse author,
    String text,
    PostVisibility visibility,
    List<PostMediaResponse> media,
    long likeCount,
    boolean liked,
    long commentCount,
    Instant createdAt,
    List<CommentResponse> comments,
    @Schema(nullable = true) String commentsNextCursor) {

  public static PostDetailResponse of(
      PostResponse post, List<CommentResponse> comments, String commentsNextCursor) {
    return new PostDetailResponse(
        post.id(),
        post.author(),
        post.text(),
        post.visibility(),
        post.media(),
        post.likeCount(),
        post.liked(),
        post.commentCount(),
        post.createdAt(),
        comments,
        commentsNextCursor);
  }
}
