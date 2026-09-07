package site.gachijoopging.server.domain.auth.domain.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "daily_active_users")
@IdClass(DailyActiveUser.Key.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DailyActiveUser {

  @Id
  @Column(nullable = false)
  private LocalDate activeDate;

  @Id
  @Column(nullable = false)
  private UUID userId;

  public record Key(LocalDate activeDate, UUID userId) implements Serializable {

    public Key {
      Objects.requireNonNull(activeDate);
      Objects.requireNonNull(userId);
    }
  }
}
