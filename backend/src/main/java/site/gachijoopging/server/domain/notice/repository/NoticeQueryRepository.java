package site.gachijoopging.server.domain.notice.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import site.gachijoopging.server.domain.notice.dto.LatestNotice;

// 공지는 공식 안내라 차단으로 숨기지 않는다. 숨기는 것은 차단한 사람의 댓글뿐이다 (feature-scope §소셜)
@Repository
@RequiredArgsConstructor
public class NoticeQueryRepository {

  // 목록의 pinned 와 GET /crew 의 pinnedNotice 가 같은 한 건을 고르게 한 곳에 둔다
  private static final String LATEST_OF_CREW =
      """
      FROM notices l WHERE l.crew_id = %s AND l.deleted_at IS NULL
      ORDER BY l.created_at DESC, l.id DESC LIMIT 1
      """;

  // 댓글 수와 상세의 댓글이 같은 조건을 써야 commentCount 가 목록과 어긋나지 않는다
  private static final String VISIBLE_COMMENT =
      """
      c.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = :me AND b.blocked_id = c.author_id)
      """;

  private static final String NOTICE_COLUMNS =
      """
      SELECT n.id, n.crew_id, n.title, n.body, n.created_at,
             n.id = (SELECT l.id %s) AS pinned,
             (SELECT count(*) FROM notice_comments c WHERE c.notice_id = n.id AND %s) AS comment_count
      FROM notices n
      """
          .formatted(LATEST_OF_CREW.formatted("n.crew_id"), VISIBLE_COMMENT);

  private static final String COMMENT_COLUMNS =
      """
      SELECT c.id, c.author_id, u.nickname, u.status, um.object_key AS photo_key, c.text, c.created_at,
             n.crew_id
      FROM notice_comments c
      JOIN notices n ON n.id = c.notice_id
      JOIN users u ON u.id = c.author_id
      LEFT JOIN media um ON um.id = u.photo_media_id
      """;

  private final JdbcClient jdbc;

  public record NoticeRow(
      UUID id,
      UUID crewId,
      String title,
      String body,
      Instant createdAt,
      boolean pinned,
      long commentCount) {}

  public record CommentRow(
      UUID id,
      UUID authorId,
      String nickname,
      String status,
      String photoKey,
      String text,
      Instant createdAt,
      UUID crewId) {}

  /** 최신부터 limit 개. (beforeCreatedAt, beforeId) 가 있으면 그보다 오래된 것만. */
  public List<NoticeRow> findPage(
      UUID me, UUID crewId, Instant beforeCreatedAt, UUID beforeId, int limit) {
    String sql =
        NOTICE_COLUMNS
            + "WHERE n.crew_id = :crewId AND n.deleted_at IS NULL "
            + (beforeId == null ? "" : "AND (n.created_at, n.id) < (:beforeCreatedAt, :beforeId) ")
            + "ORDER BY n.created_at DESC, n.id DESC LIMIT :limit";
    JdbcClient.StatementSpec statement =
        jdbc.sql(sql).param("me", me).param("crewId", crewId).param("limit", limit);
    if (beforeId != null) {
      statement =
          statement.param("beforeCreatedAt", utc(beforeCreatedAt)).param("beforeId", beforeId);
    }
    return statement.query(NoticeQueryRepository::notice).list();
  }

  /** 지워지지 않은 공지. 어느 크루 것인지는 부르는 쪽이 crewId 로 본다. */
  public Optional<NoticeRow> find(UUID me, UUID noticeId) {
    return jdbc.sql(NOTICE_COLUMNS + "WHERE n.id = :noticeId AND n.deleted_at IS NULL")
        .param("me", me)
        .param("noticeId", noticeId)
        .query(NoticeQueryRepository::notice)
        .optional();
  }

  public Optional<LatestNotice> findLatest(UUID crewId) {
    return jdbc.sql("SELECT l.id, l.title, l.created_at " + LATEST_OF_CREW.formatted(":crewId"))
        .param("crewId", crewId)
        .query(
            (rs, i) ->
                new LatestNotice(
                    rs.getObject("id", UUID.class),
                    rs.getString("title"),
                    rs.getObject("created_at", OffsetDateTime.class).toInstant()))
        .optional();
  }

  /** 오래된 것부터 전부. */
  public List<CommentRow> findComments(UUID me, UUID noticeId) {
    return jdbc.sql(
            COMMENT_COLUMNS
                + "WHERE c.notice_id = :noticeId AND "
                + VISIBLE_COMMENT
                + "ORDER BY c.created_at, c.id")
        .param("me", me)
        .param("noticeId", noticeId)
        .query(NoticeQueryRepository::comment)
        .list();
  }

  /** 지워지지 않은 공지의 보이는 댓글. 어느 크루 것인지는 부르는 쪽이 crewId 로 본다. */
  public Optional<CommentRow> findVisibleComment(UUID me, UUID commentId) {
    return jdbc.sql(
            COMMENT_COLUMNS
                + "WHERE n.deleted_at IS NULL AND "
                + VISIBLE_COMMENT
                + "AND c.id = :commentId")
        .param("me", me)
        .param("commentId", commentId)
        .query(NoticeQueryRepository::comment)
        .optional();
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

  private static NoticeRow notice(ResultSet rs, int rowNum) throws SQLException {
    return new NoticeRow(
        rs.getObject("id", UUID.class),
        rs.getObject("crew_id", UUID.class),
        rs.getString("title"),
        rs.getString("body"),
        rs.getObject("created_at", OffsetDateTime.class).toInstant(),
        rs.getBoolean("pinned"),
        rs.getLong("comment_count"));
  }

  private static CommentRow comment(ResultSet rs, int rowNum) throws SQLException {
    return new CommentRow(
        rs.getObject("id", UUID.class),
        rs.getObject("author_id", UUID.class),
        rs.getString("nickname"),
        rs.getString("status"),
        rs.getString("photo_key"),
        rs.getString("text"),
        rs.getObject("created_at", OffsetDateTime.class).toInstant(),
        rs.getObject("crew_id", UUID.class));
  }

  private static OffsetDateTime utc(Instant instant) {
    return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
  }
}
