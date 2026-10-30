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
@Table(name = "notices")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Notice {

  @Id private UUID id;

  @Column(nullable = false)
  private UUID crewId;

  @Column(nullable = false)
  private UUID authorId;

  @Column(nullable = false)
  private String title;

  @Column(nullable = false)
  private String body;

  @Column(nullable = false)
  private Instant createdAt;

  @Column(nullable = false)
  private Instant updatedAt;

  private Instant deletedAt;

  public void update(String title, String body, Instant now) {
    if (title != null) {
      this.title = title;
    }
    if (body != null) {
      this.body = body;
    }
    this.updatedAt = now;
  }

  public void delete(Instant now) {
    this.deletedAt = now;
    this.updatedAt = now;
  }
}
