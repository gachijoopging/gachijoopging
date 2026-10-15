package site.gachijoopging.server.domain.media.entity;

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

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private MediaPurpose purpose;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;
}
