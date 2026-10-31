package site.gachijoopging.server.domain.post.repository;

import java.time.Instant;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.post.entity.Comment;

public interface CommentRepository extends JpaRepository<Comment, UUID> {

  @Modifying
  @Query(
      value =
          """
          INSERT INTO comments (id, post_id, author_id, text, created_at)
          VALUES (:id, :postId, :authorId, :text, :now)
          ON CONFLICT (id) DO NOTHING
          """,
      nativeQuery = true)
  int insertIfAbsent(
      @Param("id") UUID id,
      @Param("postId") UUID postId,
      @Param("authorId") UUID authorId,
      @Param("text") String text,
      @Param("now") Instant now);
}
