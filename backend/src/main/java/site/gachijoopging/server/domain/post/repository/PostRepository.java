package site.gachijoopging.server.domain.post.repository;

import java.time.Instant;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.post.entity.Post;

public interface PostRepository extends JpaRepository<Post, UUID> {

  @Modifying
  @Query(
      value =
          """
          INSERT INTO posts (id, crew_id, author_id, text, visibility, created_at, updated_at)
          VALUES (:id, :crewId, :authorId, :text, :visibility, :now, :now)
          ON CONFLICT (id) DO NOTHING
          """,
      nativeQuery = true)
  int insertIfAbsent(
      @Param("id") UUID id,
      @Param("crewId") UUID crewId,
      @Param("authorId") UUID authorId,
      @Param("text") String text,
      @Param("visibility") String visibility,
      @Param("now") Instant now);

  @Modifying
  @Query(
      value =
          "INSERT INTO post_media (post_id, media_id, order_index) VALUES (:postId, :mediaId, :orderIndex)",
      nativeQuery = true)
  void attach(
      @Param("postId") UUID postId,
      @Param("mediaId") UUID mediaId,
      @Param("orderIndex") int orderIndex);

  @Query(
      value = "SELECT EXISTS (SELECT 1 FROM post_media WHERE media_id = :mediaId)",
      nativeQuery = true)
  boolean attached(@Param("mediaId") UUID mediaId);

  @Modifying
  @Query(
      value =
          "INSERT INTO post_likes (post_id, user_id) VALUES (:postId, :userId) ON CONFLICT DO NOTHING",
      nativeQuery = true)
  void like(@Param("postId") UUID postId, @Param("userId") UUID userId);

  @Modifying
  @Query(
      value = "DELETE FROM post_likes WHERE post_id = :postId AND user_id = :userId",
      nativeQuery = true)
  void unlike(@Param("postId") UUID postId, @Param("userId") UUID userId);
}
