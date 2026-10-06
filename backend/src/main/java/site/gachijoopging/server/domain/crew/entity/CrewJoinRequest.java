package site.gachijoopging.server.domain.crew.entity;

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
@Table(name = "crew_join_requests")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CrewJoinRequest {

  @Id private UUID id;

  @Column(name = "crew_id", nullable = false)
  private UUID crewId;

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private JoinRequestStatus status;

  @Column(name = "decided_by")
  private UUID decidedBy;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "decided_at")
  private Instant decidedAt;
}
