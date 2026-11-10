package site.gachijoopging.server.domain.chat.repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.chat.entity.ChatMessage;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, UUID> {

  // 충돌 대상을 id 로만 둔다 — (crew_id, seq) 위반까지 삼키면 seq 직렬화가 깨져도 조용히 메시지가 사라진다.
  // 재전송마다 seq 를 소모하면 앱이 보는 번호가 빈다
  @Modifying
  @Query(
      value =
          """
          WITH next AS (
            INSERT INTO chat_seqs (crew_id, last_seq)
            SELECT :crewId, coalesce((SELECT max(seq) FROM chat_messages WHERE crew_id = :crewId), 0) + 1
            WHERE NOT EXISTS (SELECT 1 FROM chat_messages WHERE id = :id)
            ON CONFLICT (crew_id) DO UPDATE SET last_seq = chat_seqs.last_seq + 1
            RETURNING last_seq
          )
          INSERT INTO chat_messages (id, crew_id, seq, author_id, text, created_at)
          SELECT :id, :crewId, last_seq, :authorId, :text, :now FROM next
          ON CONFLICT (id) DO NOTHING
          """,
      nativeQuery = true)
  int insertIfAbsent(
      @Param("id") UUID id,
      @Param("crewId") UUID crewId,
      @Param("authorId") UUID authorId,
      @Param("text") String text,
      @Param("now") Instant now);

  @Query(
      value =
          """
          UPDATE chat_messages SET deleted_at = :now, deleted_by = :by
          WHERE id = :id AND crew_id = :crewId AND deleted_at IS NULL
          RETURNING seq
          """,
      nativeQuery = true)
  Optional<Long> deleteIfLive(
      @Param("id") UUID id,
      @Param("crewId") UUID crewId,
      @Param("by") UUID by,
      @Param("now") Instant now);

  // 앱은 읽음 요청을 늦게·뒤바뀐 순서로 보낼 수 있다. 앞으로 올 메시지를 미리 읽은 것으로 치지 않게 지금 마지막 seq 로 자른다
  @Modifying
  @Query(
      value =
          """
          INSERT INTO chat_reads (crew_id, user_id, last_seq, updated_at)
          SELECT :crewId, :userId,
                 least(:lastSeq, coalesce((SELECT last_seq FROM chat_seqs WHERE crew_id = :crewId), 0)),
                 :now
          ON CONFLICT (crew_id, user_id)
          DO UPDATE SET last_seq = greatest(chat_reads.last_seq, excluded.last_seq), updated_at = :now
          """,
      nativeQuery = true)
  void markRead(
      @Param("crewId") UUID crewId,
      @Param("userId") UUID userId,
      @Param("lastSeq") long lastSeq,
      @Param("now") Instant now);

  @Modifying
  @Query(
      value =
          """
          DELETE FROM chat_messages WHERE id IN (
            SELECT id FROM chat_messages WHERE deleted_at < :threshold LIMIT :limit)
          """,
      nativeQuery = true)
  int deleteDeletedBefore(@Param("threshold") Instant threshold, @Param("limit") int limit);
}
