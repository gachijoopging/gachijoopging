package site.gachijoopging.server.domain.auth.entity;

import static java.util.Objects.requireNonNull;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "password_reset_tokens")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PasswordResetToken {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private UUID userId;

  @Column(nullable = false, unique = true)
  private String tokenHash;

  @Column(nullable = false)
  private Instant expiresAt;

  private Instant usedAt;

  @Column(nullable = false)
  private Instant createdAt;

  @Builder
  private PasswordResetToken(UUID userId, String tokenHash, Instant expiresAt, Instant now) {
    this.userId = requireNonNull(userId, "userId");
    this.tokenHash = requireNonNull(tokenHash, "tokenHash");
    this.expiresAt = requireNonNull(expiresAt, "expiresAt");
    this.createdAt = requireNonNull(now, "now");
  }

  public boolean usable(Instant now) {
    return usedAt == null && expiresAt.isAfter(now);
  }

  public void use(Instant now) {
    this.usedAt = now;
  }
}
