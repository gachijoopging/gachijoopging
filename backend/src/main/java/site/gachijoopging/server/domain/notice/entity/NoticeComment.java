package site.gachijoopging.server.domain.notice.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "notice_comments")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NoticeComment {

  @Id private UUID id;

  @Column(nullable = false)
  private UUID noticeId;

  @Column(nullable = false)
  private UUID authorId;

  @Column(nullable = false)
  private String text;

  @Column(nullable = false)
  private Instant createdAt;

  private Instant deletedAt;

  private UUID deletedBy;

  public boolean writtenBy(UUID userId) {
    return authorId.equals(userId);
  }

  // 크루장이 남의 댓글을 지웠을 때만 남긴다 (ERD notice_comments 는 comments 와 같은 모양)
  public void delete(UUID by, Instant now) {
    this.deletedAt = now;
    this.deletedBy = writtenBy(by) ? null : by;
  }
}
