package site.gachijoopging.server.domain.post.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import site.gachijoopging.server.domain.post.entity.PostVisibility;

// 목록·상세·좋아요·삭제가 같은 조건으로 게시물을 본다 — 목록에 보인 글이 상세에서 404 가 되지 않게 한 곳에 둔다.
// 삭제됨·남의 나만 보기·현재 크루 밖·차단한 작성자는 구분 없이 보이지 않는다 (openapi GET /posts/{postId})
@Repository
@RequiredArgsConstructor
public class PostQueryRepository {

  private static final String VISIBLE =
      """
      p.deleted_at IS NULL AND p.crew_id = :crewId
      AND (p.visibility = 'CREW' OR p.author_id = :me)
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = :me AND b.blocked_id = p.author_id)
      """;

  private static final String POST_COLUMNS =
      """
      SELECT p.id, p.author_id, u.nickname, u.status, um.object_key AS photo_key,
             p.text, p.visibility, p.created_at,
             (SELECT count(*) FROM post_likes l WHERE l.post_id = p.id) AS like_count,
             EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = :me) AS liked,
             (SELECT count(*) FROM comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = :me AND b.blocked_id = c.author_id))
               AS comment_count
      FROM posts p
      JOIN users u ON u.id = p.author_id
      LEFT JOIN media um ON um.id = u.photo_media_id
      """;

  private final JdbcClient jdbc;

  public record PostRow(
      UUID id,
      UUID authorId,
      String nickname,
      String status,
      String photoKey,
      String text,
      PostVisibility visibility,
      Instant createdAt,
      long likeCount,
      boolean liked,
      long commentCount) {}

  public record MediaRow(UUID postId, String objectKey, String thumbKey) {}

  /** crewOnly 면 CREW 만, authorId 가 있으면 그 사람 글만. 기간은 [fromAt, toAt). */
  public record Filter(
      boolean crewOnly,
      UUID authorId,
      Instant fromAt,
      Instant toAt,
      Instant beforeCreatedAt,
      UUID beforeId) {}

  public Optional<PostRow> findVisible(UUID me, UUID crewId, UUID postId) {
    return jdbc.sql(POST_COLUMNS + "WHERE " + VISIBLE + "AND p.id = :postId")
        .param("me", me)
        .param("crewId", crewId)
        .param("postId", postId)
        .query(PostQueryRepository::post)
        .optional();
  }

  // 빠진 조건은 "IS NULL OR" 로 묶지 않고 아예 뺀다 — generic plan 이 그 OR 때문에 인덱스를 못 탈 수 있다
  public List<PostRow> findPage(UUID me, UUID crewId, Filter filter, int limit) {
    StringBuilder sql = new StringBuilder(POST_COLUMNS).append("WHERE ").append(VISIBLE);
    if (filter.crewOnly()) {
      sql.append("AND p.visibility = 'CREW' ");
    }
    if (filter.authorId() != null) {
      sql.append("AND p.author_id = :authorId ");
    }
    if (filter.fromAt() != null) {
      sql.append("AND p.created_at >= :fromAt AND p.created_at < :toAt ");
    }
    if (filter.beforeId() != null) {
      sql.append("AND (p.created_at, p.id) < (:beforeCreatedAt, :beforeId) ");
    }
    sql.append("ORDER BY p.created_at DESC, p.id DESC LIMIT :limit");

    JdbcClient.StatementSpec statement =
        jdbc.sql(sql.toString()).param("me", me).param("crewId", crewId).param("limit", limit);
    if (filter.authorId() != null) {
      statement = statement.param("authorId", filter.authorId());
    }
    if (filter.fromAt() != null) {
      statement = statement.param("fromAt", utc(filter.fromAt())).param("toAt", utc(filter.toAt()));
    }
    if (filter.beforeId() != null) {
      statement =
          statement
              .param("beforeCreatedAt", utc(filter.beforeCreatedAt()))
              .param("beforeId", filter.beforeId());
    }
    return statement.query(PostQueryRepository::post).list();
  }

  /** 게시물별 사진을 순서대로. 사진이 없는 게시물은 키가 없다. */
  public Map<UUID, List<MediaRow>> findMedia(Collection<UUID> postIds) {
    if (postIds.isEmpty()) {
      return Map.of();
    }
    Map<UUID, List<MediaRow>> byPost = new LinkedHashMap<>();
    jdbc.sql(
            """
            SELECT pm.post_id, m.object_key, m.thumb_key
            FROM post_media pm JOIN media m ON m.id = pm.media_id
            WHERE pm.post_id IN (:postIds)
            ORDER BY pm.post_id, pm.order_index
            """)
        .param("postIds", postIds)
        .query(
            (rs, i) ->
                new MediaRow(
                    rs.getObject("post_id", UUID.class),
                    rs.getString("object_key"),
                    rs.getString("thumb_key")))
        .list()
        .forEach(row -> byPost.computeIfAbsent(row.postId(), id -> new ArrayList<>()).add(row));
    return byPost;
  }

  public boolean isMember(UUID crewId, UUID userId) {
    return jdbc.sql(
            "SELECT EXISTS (SELECT 1 FROM crew_members WHERE crew_id = :crewId AND user_id = :userId)")
        .param("crewId", crewId)
        .param("userId", userId)
        .query(Boolean.class)
        .single();
  }

  // 나가기·추방이 지우는 행을 잡아, 그 커밋 뒤에는 없는 것으로 보고 앞이면 그쪽을 기다리게 한다
  public boolean lockMembership(UUID crewId, UUID userId) {
    return jdbc.sql(
            "SELECT 1 FROM crew_members WHERE crew_id = :crewId AND user_id = :userId FOR SHARE")
        .param("crewId", crewId)
        .param("userId", userId)
        .query(Integer.class)
        .optional()
        .isPresent();
  }

  // 위임이 잠그는 크루 행을 잡아, 그 커밋 뒤의 leader_id 로 대조한다
  public boolean lockLeader(UUID crewId, UUID userId) {
    return jdbc.sql("SELECT leader_id = :userId FROM crews WHERE id = :crewId FOR SHARE")
        .param("crewId", crewId)
        .param("userId", userId)
        .query(Boolean.class)
        .optional()
        .orElse(false);
  }

  private static PostRow post(ResultSet rs, int rowNum) throws SQLException {
    return new PostRow(
        rs.getObject("id", UUID.class),
        rs.getObject("author_id", UUID.class),
        rs.getString("nickname"),
        rs.getString("status"),
        rs.getString("photo_key"),
        rs.getString("text"),
        PostVisibility.valueOf(rs.getString("visibility")),
        rs.getObject("created_at", OffsetDateTime.class).toInstant(),
        rs.getLong("like_count"),
        rs.getBoolean("liked"),
        rs.getLong("comment_count"));
  }

  private static OffsetDateTime utc(Instant instant) {
    return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
  }
}
