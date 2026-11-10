package site.gachijoopging.server.domain.post.repository;

import java.time.Instant;
import java.util.List;
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

  // 크루장이 남의 글을 지웠을 때만 deleted_by 를 남긴다 (ERD posts.deleted_by)
  @Modifying
  @Query(
      value =
          """
          UPDATE posts
          SET deleted_at = :now, updated_at = :now,
              deleted_by = CASE WHEN author_id = :by THEN NULL ELSE CAST(:by AS uuid) END
          WHERE id = :id AND deleted_at IS NULL
          """,
      nativeQuery = true)
  int deleteIfLive(@Param("id") UUID id, @Param("by") UUID by, @Param("now") Instant now);

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

  @Query(
      value = "SELECT id FROM posts WHERE deleted_at < :threshold LIMIT :limit",
      nativeQuery = true)
  List<UUID> findDeletedBefore(@Param("threshold") Instant threshold, @Param("limit") int limit);

  @Query(value = "SELECT media_id FROM post_media WHERE post_id IN (:ids)", nativeQuery = true)
  List<UUID> findMediaIds(@Param("ids") List<UUID> ids);

  // 자식 행에 ON DELETE CASCADE 가 없어 같은 문장에서 지운다. 지워지지 않은 댓글도 게시물과 함께 간다
  @Modifying
  @Query(
      value =
          """
          WITH likes AS (DELETE FROM post_likes WHERE post_id IN (:ids)),
               links AS (DELETE FROM post_media WHERE post_id IN (:ids)),
               replies AS (DELETE FROM comments WHERE post_id IN (:ids))
          DELETE FROM posts WHERE id IN (:ids)
          """,
      nativeQuery = true)
  int purge(@Param("ids") List<UUID> ids);
}
