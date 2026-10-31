package site.gachijoopging.server.domain.safety.entity;

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
@Table(name = "reports")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Report {

  @Id private UUID id;

  @Column(nullable = false)
  private UUID crewId;

  @Column(nullable = false)
  private UUID reporterId;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private ReportTargetType targetType;

  @Column(nullable = false)
  private String targetId;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private ReportReason reason;

  private String memo;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private ReportStatus status;

  @Enumerated(EnumType.STRING)
  private ReportResult result;

  private UUID resolvedBy;

  private Instant resolvedAt;

  @Column(nullable = false)
  private Instant createdAt;

  public boolean reportedBy(UUID userId) {
    return reporterId.equals(userId);
  }

  public boolean resolved() {
    return status == ReportStatus.RESOLVED;
  }

  // 추방으로 닫히면 result 는 null 이다 (ERD reports.result)
  public void resolve(ReportResult result, UUID by, Instant now) {
    this.status = ReportStatus.RESOLVED;
    this.result = result;
    this.resolvedBy = by;
    this.resolvedAt = now;
  }
}
