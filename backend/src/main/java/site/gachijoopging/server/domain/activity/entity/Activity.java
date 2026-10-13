package site.gachijoopging.server.domain.activity.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "activities")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Activity {

  @Id private UUID id;

  @Column(name = "user_id", nullable = false)
  private UUID userId;

  @Column(name = "crew_id", nullable = false)
  private UUID crewId;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private ActivityStatus status;

  @Column(name = "started_at", nullable = false)
  private Instant startedAt;

  @Column(name = "ended_at")
  private Instant endedAt;

  @Column(name = "duration_sec", nullable = false)
  private int durationSec;

  @Column(name = "paused_sec", nullable = false)
  private int pausedSec;

  @Column(nullable = false)
  private boolean paused;

  @Column(name = "paused_at")
  private Instant pausedAt;

  @Column(name = "distance_m", nullable = false)
  private int distanceM;

  private Integer steps;

  @Column(name = "location_shared", nullable = false)
  private boolean locationShared;

  @Column(name = "item_count", nullable = false)
  private int itemCount;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "by_category", nullable = false)
  private Map<String, Integer> byCategory;

  @Column(name = "deleted_at")
  private Instant deletedAt;

  public boolean ownedBy(UUID userId) {
    return this.userId.equals(userId);
  }

  public boolean inProgress() {
    return status == ActivityStatus.IN_PROGRESS;
  }

  public void pause(Instant now) {
    if (paused) {
      return;
    }
    paused = true;
    pausedAt = now;
  }

  public void resume(Instant now) {
    if (!paused) {
      return;
    }
    pausedSec += (int) Duration.between(pausedAt, now).toSeconds();
    paused = false;
    pausedAt = null;
  }

  public void recount(List<ActivityItem> items) {
    Map<String, Integer> counts = new TreeMap<>();
    items.forEach(
        item -> counts.merge(item.getFinalCategory().name(), item.getQuantity(), Integer::sum));
    itemCount = counts.values().stream().mapToInt(Integer::intValue).sum();
    byCategory = counts;
  }
}
