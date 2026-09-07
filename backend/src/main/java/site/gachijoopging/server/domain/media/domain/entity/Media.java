package site.gachijoopging.server.domain.media.domain.entity;

import static java.util.Objects.requireNonNull;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "media")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Media {

  @Id private UUID id;

  @Column(name = "owner_id", nullable = false)
  private UUID ownerId;

  @Column(name = "object_key", nullable = false)
  private String objectKey;

  @Column(name = "thumb_key", nullable = false)
  private String thumbKey;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Builder
  private Media(UUID id, UUID ownerId, String objectKey, String thumbKey, Instant createdAt) {
    this.id = requireNonNull(id, "id");
    this.ownerId = requireNonNull(ownerId, "ownerId");
    this.objectKey = requireNonNull(objectKey, "objectKey");
    this.thumbKey = requireNonNull(thumbKey, "thumbKey");
    this.createdAt = requireNonNull(createdAt, "createdAt");
  }
}
