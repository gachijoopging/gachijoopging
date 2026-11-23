package site.gachijoopging.server.domain.chat.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class ChatQueryRepository {

  private static final String MESSAGE_COLUMNS =
      """
      SELECT m.seq, m.id, m.author_id, u.nickname, u.status, um.object_key AS photo_key,
             m.text, m.created_at
      FROM chat_messages m
      JOIN users u ON u.id = m.author_id
      LEFT JOIN media um ON um.id = u.photo_media_id
      """;

  // 지운 메시지와 보는 사람이 차단한 사람의 메시지는 보이지 않는다 (차단은 한 방향, 01-구조 §4 차단 기준)
  private static final String VISIBLE =
      """
      m.crew_id = :crewId AND m.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.blocker_id = :me AND b.blocked_id = m.author_id)
      """;

  // 안 읽은 메시지 — unreadChat 과 CHAT 알림이 같은 정의를 써야 배지와 알림이 어긋나지 않는다.
  // 가입 전 메시지는 세지 않는다. 읽음 기록이 없는 새 크루원에게 크루의 옛 이력 전체가 안 읽음이 되기 때문이다
  private static final String UNREAD =
      """
      m.crew_id = cm.crew_id AND m.deleted_at IS NULL AND m.author_id <> cm.user_id
        AND m.seq > coalesce(r.last_seq, 0) AND m.created_at >= cm.joined_at
        AND NOT EXISTS (SELECT 1 FROM blocks b
                        WHERE b.blocker_id = cm.user_id AND b.blocked_id = m.author_id)
      """;

  private static final String MEMBER_READS =
      """
      FROM crew_members cm
      LEFT JOIN chat_reads r ON r.crew_id = cm.crew_id AND r.user_id = cm.user_id
      """;

  private final JdbcClient jdbc;

  public record MessageRow(
      long seq,
      UUID id,
      UUID authorId,
      String nickname,
      String status,
      String photoKey,
      String text,
      Instant createdAt) {}

  // 나가기·추방이 같은 행을 잡아 커밋까지 소속이 유효하다
  public Optional<UUID> lockCrewOf(UUID userId) {
    return jdbc.sql("SELECT crew_id FROM crew_members WHERE user_id = :userId FOR SHARE")
        .param("userId", userId)
        .query(UUID.class)
        .optional();
  }

  // seq 를 발급 순서대로 커밋하려고 같은 크루의 저장을 줄 세운다 (ERD 설계 근거 "채팅 seq").
  // 두 정수 키는 UserLock 의 bigint 키와 다른 키 공간이다
  public void lockCrewChat(UUID crewId) {
    jdbc.sql(
            "SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('chat'),"
                + " hashtext(CAST(:crewId AS text)))) l")
        .param("crewId", crewId)
        .query(Integer.class)
        .single();
  }

  public Optional<MessageRow> findMessage(UUID id) {
    return jdbc.sql(MESSAGE_COLUMNS + "WHERE m.id = :id")
        .param("id", id)
        .query(ChatQueryRepository::message)
        .optional();
  }

  public List<MessageRow> findLatest(UUID crewId, UUID me, Long beforeSeq, int limit) {
    return jdbc.sql(
            MESSAGE_COLUMNS
                + "WHERE "
                + VISIBLE
                + (beforeSeq == null ? "" : "AND m.seq < :beforeSeq ")
                + "ORDER BY m.seq DESC LIMIT :limit")
        .param("crewId", crewId)
        .param("me", me)
        .param("beforeSeq", beforeSeq)
        .param("limit", limit)
        .query(ChatQueryRepository::message)
        .list();
  }

  public List<MessageRow> findAfter(UUID crewId, UUID me, long afterSeq, int limit) {
    return jdbc.sql(
            MESSAGE_COLUMNS
                + "WHERE "
                + VISIBLE
                + "AND m.seq > :afterSeq ORDER BY m.seq LIMIT :limit")
        .param("crewId", crewId)
        .param("me", me)
        .param("afterSeq", afterSeq)
        .param("limit", limit)
        .query(ChatQueryRepository::message)
        .list();
  }

  public int countUnread(UUID crewId, UUID userId) {
    return jdbc.sql(
            "SELECT count(*) "
                + MEMBER_READS
                + "JOIN chat_messages m ON "
                + UNREAD
                + "WHERE cm.crew_id = :crewId AND cm.user_id = :userId")
        .param("crewId", crewId)
        .param("userId", userId)
        .query(Integer.class)
        .single();
  }

  /** 이 메시지 전에는 안 읽은 메시지가 없던 크루원 — 마지막으로 읽은 뒤 처음 받는 메시지다. */
  public List<UUID> findFirstUnreadRecipients(UUID crewId, UUID authorId) {
    return jdbc.sql(
            "SELECT cm.user_id "
                + MEMBER_READS
                + """
                WHERE cm.crew_id = :crewId AND cm.user_id <> :authorId
                  AND NOT EXISTS (SELECT 1 FROM blocks b
                                  WHERE b.blocker_id = cm.user_id AND b.blocked_id = :authorId)
                  AND NOT EXISTS (SELECT 1 FROM chat_messages m WHERE
                """
                + UNREAD
                + ")")
        .param("crewId", crewId)
        .param("authorId", authorId)
        .query(UUID.class)
        .list();
  }

  // 보낸 사람 본인도 echo 를 받아야 전송 중 표시를 시각으로 바꾼다 (3-7)
  public List<UUID> findRecipients(UUID crewId, UUID authorId) {
    return jdbc.sql(
            """
            SELECT m.user_id FROM crew_members m
            WHERE m.crew_id = :crewId
              AND NOT EXISTS (SELECT 1 FROM blocks b
                              WHERE b.blocker_id = m.user_id AND b.blocked_id = :authorId)
            """)
        .param("crewId", crewId)
        .param("authorId", authorId)
        .query(UUID.class)
        .list();
  }

  public List<UUID> findMembers(UUID crewId) {
    return jdbc.sql("SELECT user_id FROM crew_members WHERE crew_id = :crewId")
        .param("crewId", crewId)
        .query(UUID.class)
        .list();
  }

  private static MessageRow message(ResultSet rs, int rowNum) throws SQLException {
    return new MessageRow(
        rs.getLong("seq"),
        rs.getObject("id", UUID.class),
        rs.getObject("author_id", UUID.class),
        rs.getString("nickname"),
        rs.getString("status"),
        rs.getString("photo_key"),
        rs.getString("text"),
        rs.getObject("created_at", OffsetDateTime.class).toInstant());
  }
}
