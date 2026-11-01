package site.gachijoopging.server.domain.notification.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

// 받는 사람은 활성 사용자만이다. 탈퇴한 사람에게 쌓을 이유가 없다 (ERD 회원 탈퇴 때)
@Repository
@RequiredArgsConstructor
public class NotificationRepository {

  private static final String COLUMNS =
      "id, user_id, type, title, detail, unread, target_type, target_id, created_at";

  private static final String INSERT =
      "INSERT INTO notifications (user_id, type, title, detail, target_type, target_id, created_at) ";

  private static final int DETAIL = 50;

  private static final String NOT_BLOCKED =
      "NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = %s AND b.blocked_id = %s)";

  private final JdbcClient jdbc;

  public record NotificationRow(
      long id,
      UUID userId,
      String type,
      String title,
      String detail,
      boolean unread,
      String targetType,
      String targetId,
      Instant createdAt) {}

  public List<NotificationRow> insertJoinRequest(
      UUID leaderId, UUID applicantId, UUID requestId, Instant now) {
    return insert(
        """
        SELECT :leaderId, 'JOIN_REQUEST', coalesce(a.nickname, '') || ' 님이 가입을 신청했어요',
               left(a.intro, %d), 'JOIN_REQUESTS', :targetId, :now
        FROM users a JOIN users r ON r.id = :leaderId AND r.status = 'ACTIVE'
        WHERE a.id = :applicantId
        """
            .formatted(DETAIL),
        Map.of("leaderId", leaderId, "applicantId", applicantId, "targetId", requestId.toString()),
        now);
  }

  public List<NotificationRow> insertCrewJoined(UUID leaderId, UUID memberId, Instant now) {
    return insert(
        """
        SELECT :leaderId, 'CREW_JOINED', coalesce(m.nickname, '') || ' 님이 크루에 가입했어요',
               '공개 크루에 바로 가입했어요', 'MEMBERS', :targetId, :now
        FROM users m JOIN users r ON r.id = :leaderId AND r.status = 'ACTIVE'
        WHERE m.id = :memberId
        """,
        Map.of("leaderId", leaderId, "memberId", memberId, "targetId", memberId.toString()),
        now);
  }

  public List<NotificationRow> insertJoinDecided(
      UUID applicantId, UUID crewId, boolean approved, Instant now) {
    return insert(
        """
        SELECT u.id, :type, c.name || :title, :detail, 'CREW', :targetId, :now
        FROM crews c JOIN users u ON u.id = :applicantId AND u.status = 'ACTIVE'
        WHERE c.id = :crewId
        """,
        Map.of(
            "applicantId",
            applicantId,
            "crewId",
            crewId,
            "type",
            approved ? "JOIN_APPROVED" : "JOIN_REJECTED",
            "title",
            approved ? " 가입이 승인됐어요" : " 가입 신청이 거절됐어요",
            "detail",
            approved ? "이제 크루원과 함께 줍깅할 수 있어요" : "다른 크루를 찾거나 다시 신청할 수 있어요",
            "targetId",
            crewId.toString()),
        now);
  }

  // 공지는 공식 안내라 차단으로 거르지 않는다 (feature-scope §소셜)
  public List<NotificationRow> insertNotice(UUID noticeId, UUID authorId, Instant now) {
    return insert(
        """
        SELECT m.user_id, 'NOTICE', '크루장이 공지를 올렸어요', left(n.title, %d), 'NOTICE', :targetId, :now
        FROM notices n
        JOIN crew_members m ON m.crew_id = n.crew_id
        JOIN users u ON u.id = m.user_id AND u.status = 'ACTIVE'
        WHERE n.id = :noticeId AND m.user_id <> :authorId
        """
            .formatted(DETAIL),
        Map.of("noticeId", noticeId, "authorId", authorId, "targetId", noticeId.toString()),
        now);
  }

  // 글쓴이가 그사이 크루를 떠났으면 그 크루의 소식을 받지 않는다
  public List<NotificationRow> insertComment(
      UUID postId, UUID postAuthorId, UUID commentId, Instant now) {
    return insert(
        """
        SELECT r.id, 'COMMENT', coalesce(a.nickname, '') || ' 님이 댓글을 남겼어요',
               left(c.text, %d), 'POST', :targetId, :now
        FROM comments c
        JOIN users a ON a.id = c.author_id
        JOIN posts p ON p.id = c.post_id
        JOIN users r ON r.id = :postAuthorId AND r.status = 'ACTIVE'
        JOIN crew_members m ON m.crew_id = p.crew_id AND m.user_id = r.id
        WHERE c.id = :commentId AND c.author_id <> r.id AND %s
        """
            .formatted(DETAIL, NOT_BLOCKED.formatted("r.id", "c.author_id")),
        Map.of("postAuthorId", postAuthorId, "commentId", commentId, "targetId", postId.toString()),
        now);
  }

  // 활동 위치는 차단으로 숨기는 개인 콘텐츠다. 팔로우 뒤 크루를 옮겼으면 같은 크루가 아니니 보내지 않는다
  public List<NotificationRow> insertActivityStarted(
      UUID crewId, UUID userId, UUID activityId, Instant now) {
    return insert(
        """
        SELECT f.follower_id, 'ACTIVITY_STARTED', coalesce(s.nickname, '') || ' 님이 줍깅을 시작했어요',
               '', 'LIVE', :targetId, :now
        FROM follows f
        JOIN users s ON s.id = f.followee_id
        JOIN users u ON u.id = f.follower_id AND u.status = 'ACTIVE' AND u.notify_activity_start
        JOIN crew_members m ON m.user_id = f.follower_id AND m.crew_id = :crewId
        WHERE f.followee_id = :userId AND %s
        """
            .formatted(NOT_BLOCKED.formatted("f.follower_id", "f.followee_id")),
        Map.of("crewId", crewId, "userId", userId, "targetId", activityId.toString()),
        now);
  }

  // 크루장 관리 정보라 차단으로 거르지 않는다
  public List<NotificationRow> insertReport(UUID reportId, Instant now) {
    return insert(
        """
        SELECT c.leader_id, 'REPORT', '신고가 접수됐어요',
               left(coalesce(CASE r.target_type
                 WHEN 'POST' THEN (SELECT t.text FROM posts t WHERE t.id = CAST(r.target_id AS uuid))
                 WHEN 'COMMENT' THEN (SELECT t.text FROM comments t WHERE t.id = CAST(r.target_id AS uuid))
                 WHEN 'NOTICE_COMMENT'
                   THEN (SELECT t.text FROM notice_comments t WHERE t.id = CAST(r.target_id AS uuid))
                 WHEN 'CHAT_MESSAGE'
                   THEN (SELECT t.text FROM chat_messages t WHERE t.id = CAST(r.target_id AS uuid))
                 WHEN 'USER' THEN (SELECT t.nickname FROM users t WHERE t.id = CAST(r.target_id AS uuid))
               END, ''), %d), 'REPORTS', :targetId, :now
        FROM reports r
        JOIN crews c ON c.id = r.crew_id
        JOIN users u ON u.id = c.leader_id AND u.status = 'ACTIVE'
        WHERE r.id = :reportId
        """
            .formatted(DETAIL),
        Map.of("reportId", reportId, "targetId", reportId.toString()),
        now);
  }

  public List<NotificationRow> insertReportResolved(UUID reporterId, String detail, Instant now) {
    return insert(
        """
        SELECT u.id, 'REPORT_RESOLVED', '신고 처리가 완료됐어요', :detail, 'NOTIFICATIONS', NULL, :now
        FROM users u WHERE u.id = :reporterId AND u.status = 'ACTIVE'
        """,
        Map.of("reporterId", reporterId, "detail", detail),
        now);
  }

  public List<NotificationRow> insertChat(UUID messageId, List<UUID> recipients, Instant now) {
    return insert(
        """
        SELECT u.id, 'CHAT', '크루 채팅에 새 메시지가 있어요',
               left(coalesce(a.nickname, '') || ': ' || m.text, %d), 'CHAT', NULL, :now
        FROM chat_messages m
        JOIN users a ON a.id = m.author_id
        JOIN users u ON u.id IN (:recipients) AND u.status = 'ACTIVE'
        WHERE m.id = :messageId
        """
            .formatted(DETAIL),
        Map.of("messageId", messageId, "recipients", recipients),
        now);
  }

  // 지워진 글이라 갈 곳이 없다 — target.id 는 비운다 (2-3 POST_REMOVED)
  public List<NotificationRow> insertPostRemoved(UUID postId, Instant now) {
    return insert(
        """
        SELECT u.id, 'POST_REMOVED', '내 게시물이 크루장에 의해 삭제됐어요', left(p.text, %d), 'POST', NULL, :now
        FROM posts p JOIN users u ON u.id = p.author_id AND u.status = 'ACTIVE'
        WHERE p.id = :postId
        """
            .formatted(DETAIL),
        Map.of("postId", postId),
        now);
  }

  /** 최근 것부터 limit 개. (beforeCreatedAt, beforeId) 가 있으면 그보다 먼저 온 것만. */
  public List<NotificationRow> findPage(
      UUID userId, Instant beforeCreatedAt, Long beforeId, int limit) {
    String sql =
        "SELECT "
            + COLUMNS
            + " FROM notifications WHERE user_id = :userId "
            + (beforeId == null ? "" : "AND (created_at, id) < (:beforeCreatedAt, :beforeId) ")
            + "ORDER BY created_at DESC, id DESC LIMIT :limit";
    JdbcClient.StatementSpec statement =
        jdbc.sql(sql).param("userId", userId).param("limit", limit);
    if (beforeId != null) {
      statement =
          statement.param("beforeCreatedAt", utc(beforeCreatedAt)).param("beforeId", beforeId);
    }
    return statement.query(NotificationRepository::row).list();
  }

  public void markAllRead(UUID userId) {
    jdbc.sql("UPDATE notifications SET unread = false WHERE user_id = :userId AND unread")
        .param("userId", userId)
        .update();
  }

  public void markRead(UUID userId, List<Long> ids) {
    jdbc.sql(
            "UPDATE notifications SET unread = false"
                + " WHERE user_id = :userId AND unread AND id IN (:ids)")
        .param("userId", userId)
        .param("ids", ids)
        .update();
  }

  public long countUnread(UUID userId) {
    return jdbc.sql("SELECT count(*) FROM notifications WHERE user_id = :userId AND unread")
        .param("userId", userId)
        .query(Long.class)
        .single();
  }

  public long countPendingJoinRequests(UUID crewId) {
    return jdbc.sql(
            "SELECT count(*) FROM crew_join_requests WHERE crew_id = :crewId AND status = 'PENDING'")
        .param("crewId", crewId)
        .query(Long.class)
        .single();
  }

  public long countPendingReports(UUID crewId) {
    return jdbc.sql("SELECT count(*) FROM reports WHERE crew_id = :crewId AND status = 'PENDING'")
        .param("crewId", crewId)
        .query(Long.class)
        .single();
  }

  public Map<UUID, List<String>> findPushTokens(List<UUID> userIds) {
    return jdbc
        .sql("SELECT user_id, push_token FROM devices WHERE user_id IN (:userIds)")
        .param("userIds", userIds)
        .query(
            (rs, rowNum) ->
                Map.entry(rs.getObject("user_id", UUID.class), rs.getString("push_token")))
        .list()
        .stream()
        .collect(
            Collectors.groupingBy(
                Map.Entry::getKey, Collectors.mapping(Map.Entry::getValue, Collectors.toList())));
  }

  private List<NotificationRow> insert(String select, Map<String, Object> params, Instant now) {
    return jdbc.sql(INSERT + select + " RETURNING " + COLUMNS)
        .params(params)
        .param("now", utc(now))
        .query(NotificationRepository::row)
        .list();
  }

  private static NotificationRow row(ResultSet rs, int rowNum) throws SQLException {
    return new NotificationRow(
        rs.getLong("id"),
        rs.getObject("user_id", UUID.class),
        rs.getString("type"),
        rs.getString("title"),
        rs.getString("detail"),
        rs.getBoolean("unread"),
        rs.getString("target_type"),
        rs.getString("target_id"),
        rs.getObject("created_at", OffsetDateTime.class).toInstant());
  }

  private static OffsetDateTime utc(Instant instant) {
    return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
  }
}
