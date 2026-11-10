package site.gachijoopging.server.domain.notice.repository;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.notice.entity.Notice;

public interface NoticeRepository extends JpaRepository<Notice, UUID> {

  // 수정은 모든 컬럼을 다시 쓰므로, 잠그지 않으면 엇갈린 삭제를 deleted_at = NULL 로 되돌린다
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("SELECT n FROM Notice n WHERE n.id = :id")
  Optional<Notice> findForUpdate(@Param("id") UUID id);

  @Modifying
  @Query(
      value =
          """
          INSERT INTO notices (id, crew_id, author_id, title, body, created_at, updated_at)
          VALUES (:id, :crewId, :authorId, :title, :body, :now, :now)
          ON CONFLICT (id) DO NOTHING
          """,
      nativeQuery = true)
  int insertIfAbsent(
      @Param("id") UUID id,
      @Param("crewId") UUID crewId,
      @Param("authorId") UUID authorId,
      @Param("title") String title,
      @Param("body") String body,
      @Param("now") Instant now);

  @Query(
      value = "SELECT id FROM notices WHERE deleted_at < :threshold LIMIT :limit",
      nativeQuery = true)
  List<UUID> findDeletedBefore(@Param("threshold") Instant threshold, @Param("limit") int limit);

  // 공지 댓글에 ON DELETE CASCADE 가 없어 같은 문장에서 지운다. 지워지지 않은 댓글도 공지와 함께 간다
  @Modifying
  @Query(
      value =
          """
          WITH replies AS (DELETE FROM notice_comments WHERE notice_id IN (:ids))
          DELETE FROM notices WHERE id IN (:ids)
          """,
      nativeQuery = true)
  int purge(@Param("ids") List<UUID> ids);
}
