package site.gachijoopging.server.domain.notice.repository;

import jakarta.persistence.LockModeType;
import java.time.Instant;
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
}
