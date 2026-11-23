package site.gachijoopging.server.domain.safety.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import site.gachijoopging.server.domain.safety.entity.ReportTargetType;

// 크루장 관리 정보라 차단으로 숨기지 않는다 (feature-scope §소셜)
@Repository
@RequiredArgsConstructor
public class ReportQueryRepository {

  private static final String PENDING_COLUMNS =
      """
      SELECT r.id, r.reporter_id, u.nickname, u.status, um.object_key AS photo_key,
             r.target_type, r.target_id, r.reason, r.memo, r.created_at,
             CASE r.target_type
               WHEN 'POST' THEN (SELECT t.text FROM posts t WHERE t.id = CAST(r.target_id AS uuid))
               WHEN 'COMMENT' THEN (SELECT t.text FROM comments t WHERE t.id = CAST(r.target_id AS uuid))
               WHEN 'NOTICE_COMMENT'
                 THEN (SELECT t.text FROM notice_comments t WHERE t.id = CAST(r.target_id AS uuid))
               WHEN 'CHAT_MESSAGE'
                 THEN (SELECT t.text FROM chat_messages t WHERE t.id = CAST(r.target_id AS uuid))
               WHEN 'USER' THEN (SELECT t.nickname FROM users t WHERE t.id = CAST(r.target_id AS uuid))
             END AS target_text,
             r.target_type = 'USER' AND EXISTS (
               SELECT 1 FROM users t WHERE t.id = CAST(r.target_id AS uuid) AND t.status = 'DELETED'
             ) AS target_withdrawn
      FROM reports r
      JOIN users u ON u.id = r.reporter_id
      LEFT JOIN media um ON um.id = u.photo_media_id
      """;

  private final JdbcClient jdbc;

  public record PendingRow(
      UUID id,
      UUID reporterId,
      String nickname,
      String status,
      String photoKey,
      String targetType,
      String targetId,
      String reason,
      String memo,
      Instant createdAt,
      String targetText,
      boolean targetWithdrawn) {}

  /** 먼저 접수된 것부터 limit 개. (afterCreatedAt, afterId) 가 있으면 그보다 나중 것만. */
  public List<PendingRow> findPending(
      UUID crewId, Instant afterCreatedAt, UUID afterId, int limit) {
    String sql =
        PENDING_COLUMNS
            + "WHERE r.crew_id = :crewId AND r.status = 'PENDING' "
            + (afterId == null ? "" : "AND (r.created_at, r.id) > (:afterCreatedAt, :afterId) ")
            + "ORDER BY r.created_at, r.id LIMIT :limit";
    JdbcClient.StatementSpec statement =
        jdbc.sql(sql).param("crewId", crewId).param("limit", limit);
    if (afterId != null) {
      statement =
          statement
              .param("afterCreatedAt", OffsetDateTime.ofInstant(afterCreatedAt, ZoneOffset.UTC))
              .param("afterId", afterId);
    }
    return statement.query(ReportQueryRepository::pending).list();
  }

  /**
   * 신고할 수 있는 대상인가 — 이 크루의 지워지지 않은 것, 게시물은 남의 나만 보기 제외. 사용자는 지금 크루원이고, 그 소속 행을 잡아 추방과 줄 세운다 — 추방이
   * 먼저면 없는 것으로 보고, 나중이면 추방이 이 신고까지 닫는다.
   */
  public boolean lockTarget(ReportTargetType type, UUID targetId, UUID crewId, UUID me) {
    String sql =
        switch (type) {
          case USER ->
              "SELECT 1 FROM crew_members WHERE crew_id = :crewId AND user_id = :targetId FOR SHARE";
          case POST ->
              """
              SELECT 1 FROM posts p
              WHERE p.id = :targetId AND p.crew_id = :crewId AND p.deleted_at IS NULL
                AND (p.visibility = 'CREW' OR p.author_id = :me)
              """;
          case COMMENT ->
              """
              SELECT 1 FROM comments c JOIN posts p ON p.id = c.post_id
              WHERE c.id = :targetId AND p.crew_id = :crewId
                AND c.deleted_at IS NULL AND p.deleted_at IS NULL
                AND (p.visibility = 'CREW' OR p.author_id = :me)
              """;
          case NOTICE_COMMENT ->
              """
              SELECT 1 FROM notice_comments c JOIN notices n ON n.id = c.notice_id
              WHERE c.id = :targetId AND n.crew_id = :crewId
                AND c.deleted_at IS NULL AND n.deleted_at IS NULL
              """;
          case CHAT_MESSAGE ->
              """
              SELECT 1 FROM chat_messages m
              WHERE m.id = :targetId AND m.crew_id = :crewId AND m.deleted_at IS NULL
              """;
        };
    return jdbc.sql(sql)
        .param("targetId", targetId)
        .param("crewId", crewId)
        .param("me", me)
        .query(Integer.class)
        .optional()
        .isPresent();
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

  private static PendingRow pending(ResultSet rs, int rowNum) throws SQLException {
    return new PendingRow(
        rs.getObject("id", UUID.class),
        rs.getObject("reporter_id", UUID.class),
        rs.getString("nickname"),
        rs.getString("status"),
        rs.getString("photo_key"),
        rs.getString("target_type"),
        rs.getString("target_id"),
        rs.getString("reason"),
        rs.getString("memo"),
        rs.getObject("created_at", OffsetDateTime.class).toInstant(),
        rs.getString("target_text"),
        rs.getBoolean("target_withdrawn"));
  }
}
