package site.gachijoopging.server.domain.auth.domain.entity;

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
@Table(name = "refresh_tokens")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RefreshToken {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false)
  private UUID userId;

  @Column(nullable = false, unique = true)
  private String tokenHash;

  @Column(nullable = false)
  private UUID familyId;

  @Column(nullable = false)
  private Instant expiresAt;

  private Instant revokedAt;

  @Column(nullable = false)
  private Instant createdAt;

  @Builder
  private RefreshToken(
      UUID userId, String tokenHash, UUID familyId, Instant expiresAt, Instant now) {
    this.userId = requireNonNull(userId, "userId");
    this.tokenHash = requireNonNull(tokenHash, "tokenHash");
    this.familyId = requireNonNull(familyId, "familyId");
    this.expiresAt = requireNonNull(expiresAt, "expiresAt");
    this.createdAt = requireNonNull(now, "now");
  }

  public void revoke(Instant now) {
    if (revokedAt == null) {
      this.revokedAt = now;
    }
  }

  public boolean revoked() {
    return revokedAt != null;
  }

  public boolean expiredAt(Instant now) {
    return !expiresAt.isAfter(now);
  }
}
