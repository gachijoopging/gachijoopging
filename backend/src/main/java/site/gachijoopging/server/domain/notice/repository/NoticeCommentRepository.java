package site.gachijoopging.server.domain.notice.repository;

import java.time.Instant;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.notice.entity.NoticeComment;

public interface NoticeCommentRepository extends JpaRepository<NoticeComment, UUID> {

  @Modifying
  @Query(
      value =
          """
          INSERT INTO notice_comments (id, notice_id, author_id, text, created_at)
          VALUES (:id, :noticeId, :authorId, :text, :now)
          ON CONFLICT (id) DO NOTHING
          """,
      nativeQuery = true)
  int insertIfAbsent(
      @Param("id") UUID id,
      @Param("noticeId") UUID noticeId,
      @Param("authorId") UUID authorId,
      @Param("text") String text,
      @Param("now") Instant now);
}
