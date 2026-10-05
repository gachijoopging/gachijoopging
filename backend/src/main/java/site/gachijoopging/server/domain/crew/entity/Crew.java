package site.gachijoopging.server.domain.crew.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "crews")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Crew {

  @Id private UUID id;

  @Column(nullable = false)
  private String name;

  @Column(nullable = false)
  private String intro;

  @Column(name = "photo_media_id")
  private UUID photoMediaId;

  @Column(name = "leader_id", nullable = false)
  private UUID leaderId;

  @Column(name = "invite_code", nullable = false)
  private String inviteCode;

  @Column(name = "goal_count", nullable = false)
  private int goalCount;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  @Column(name = "deleted_at")
  private Instant deletedAt;

  public boolean ledBy(UUID userId) {
    return leaderId.equals(userId);
  }

  public void update(
      String name, String intro, Optional<UUID> photoMediaId, Integer goalCount, Instant now) {
    if (name != null) {
      this.name = name;
    }
    if (intro != null) {
      this.intro = intro;
    }
    if (photoMediaId != null) {
      this.photoMediaId = photoMediaId.orElse(null);
    }
    if (goalCount != null) {
      this.goalCount = goalCount;
    }
    this.updatedAt = now;
  }
}
