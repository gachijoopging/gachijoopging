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

@Repository
@RequiredArgsConstructor
public class BlockRepository {

  private final JdbcClient jdbc;

  public record BlockedRow(
      UUID id, String nickname, String status, String photoKey, Instant blockedAt) {}

  // 계약이 204 뿐이라 자기 자신·없는 사용자는 CHECK·FK 로 터뜨리지 않고 넣지 않는다
  public void insertIfAbsent(UUID blockerId, UUID blockedId, Instant now) {
    jdbc.sql(
            """
            INSERT INTO blocks (blocker_id, blocked_id, created_at)
            SELECT :blockerId, u.id, :now FROM users u WHERE u.id = :blockedId AND u.id <> :blockerId
            ON CONFLICT DO NOTHING
            """)
        .param("blockerId", blockerId)
        .param("blockedId", blockedId)
        .param("now", utc(now))
        .update();
  }

  public void delete(UUID blockerId, UUID blockedId) {
    jdbc.sql("DELETE FROM blocks WHERE blocker_id = :blockerId AND blocked_id = :blockedId")
        .param("blockerId", blockerId)
        .param("blockedId", blockedId)
        .update();
  }

  /** 최근 차단부터 limit 개. (beforeCreatedAt, beforeId) 가 있으면 그보다 먼저 차단한 것만. */
  public List<BlockedRow> findPage(
      UUID blockerId, Instant beforeCreatedAt, UUID beforeId, int limit) {
    String sql =
        """
        SELECT u.id, u.nickname, u.status, um.object_key AS photo_key, b.created_at
        FROM blocks b
        JOIN users u ON u.id = b.blocked_id
        LEFT JOIN media um ON um.id = u.photo_media_id
        WHERE b.blocker_id = :blockerId
        """
            + (beforeId == null
                ? ""
                : "AND (b.created_at, b.blocked_id) < (:beforeCreatedAt, :beforeId) ")
            + "ORDER BY b.created_at DESC, b.blocked_id DESC LIMIT :limit";
    JdbcClient.StatementSpec statement =
        jdbc.sql(sql).param("blockerId", blockerId).param("limit", limit);
    if (beforeId != null) {
      statement =
          statement.param("beforeCreatedAt", utc(beforeCreatedAt)).param("beforeId", beforeId);
    }
    return statement.query(BlockRepository::blocked).list();
  }

  public long count(UUID blockerId) {
    return jdbc.sql("SELECT count(*) FROM blocks WHERE blocker_id = :blockerId")
        .param("blockerId", blockerId)
        .query(Long.class)
        .single();
  }

  private static BlockedRow blocked(ResultSet rs, int rowNum) throws SQLException {
    return new BlockedRow(
        rs.getObject("id", UUID.class),
        rs.getString("nickname"),
        rs.getString("status"),
        rs.getString("photo_key"),
        rs.getObject("created_at", OffsetDateTime.class).toInstant());
  }

  private static OffsetDateTime utc(Instant instant) {
    return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
  }
}
