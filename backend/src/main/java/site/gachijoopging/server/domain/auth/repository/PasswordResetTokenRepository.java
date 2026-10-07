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

  Optional<PasswordResetToken> findFirstByUserIdAndUsedAtIsNullAndExpiresAtAfterOrderByIdDesc(
      UUID userId, Instant now);

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
      WHERE t.id = :id AND t.usedAt IS NULL AND t.expiresAt > :now
      """)
  int consume(@Param("id") Long id, @Param("now") Instant now);

  // 동시에 틀린 요청이 와도 오답 횟수를 놓치면 한도가 뚫린다
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(
      """
      UPDATE PasswordResetToken t
      SET t.failedAttempts = t.failedAttempts + 1,
          t.usedAt = CASE WHEN t.failedAttempts + 1 >= :maxAttempts THEN :now ELSE t.usedAt END
      WHERE t.id = :id AND t.usedAt IS NULL
      """)
  int recordFailure(
      @Param("id") Long id, @Param("maxAttempts") int maxAttempts, @Param("now") Instant now);
}
