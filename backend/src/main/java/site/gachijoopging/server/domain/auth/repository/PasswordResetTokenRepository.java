package site.gachijoopging.server.domain.auth.repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.auth.entity.PasswordResetToken;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

  Optional<PasswordResetToken> findByTokenHash(String tokenHash);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(
      """
      UPDATE PasswordResetToken t SET t.usedAt = :now
      WHERE t.userId = :userId AND t.usedAt IS NULL
      """)
  int expireUnusedByUserId(@Param("userId") UUID userId, @Param("now") Instant now);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(
      """
      UPDATE PasswordResetToken t SET t.usedAt = :now
      WHERE t.tokenHash = :tokenHash AND t.usedAt IS NULL AND t.expiresAt > :now
      """)
  int consume(@Param("tokenHash") String tokenHash, @Param("now") Instant now);
}
