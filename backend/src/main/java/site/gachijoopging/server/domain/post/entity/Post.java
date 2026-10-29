package site.gachijoopging.server.domain.post.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "posts")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Post {

  @Id private UUID id;

  @Column(nullable = false)
  private UUID crewId;

  @Column(nullable = false)
  private UUID authorId;

  @Column(nullable = false)
  private String text;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private PostVisibility visibility;

  @Column(nullable = false)
  private Instant createdAt;

  @Column(nullable = false)
  private Instant updatedAt;

  private Instant deletedAt;

  private UUID deletedBy;

  public boolean writtenBy(UUID userId) {
    return authorId.equals(userId);
  }

  // 크루장이 남의 글을 지웠을 때만 남긴다 (ERD posts.deleted_by)
  public void delete(UUID by, Instant now) {
    this.deletedAt = now;
    this.updatedAt = now;
    this.deletedBy = writtenBy(by) ? null : by;
  }
}
