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
  @Query("DELETE FROM PasswordResetToken t WHERE t.userId = :userId")
  void deleteAllByUserId(@Param("userId") UUID userId);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("DELETE FROM PasswordResetToken t WHERE t.id = :id AND t.expiresAt > :now")
  int consume(@Param("id") Long id, @Param("now") Instant now);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(
      "DELETE FROM PasswordResetToken t WHERE t.id = :id AND t.failedAttempts + 1 >= :maxAttempts")
  int deleteIfLastAttempt(@Param("id") Long id, @Param("maxAttempts") int maxAttempts);

  // 동시에 틀린 요청이 와도 오답 횟수를 놓치면 한도가 뚫린다
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("UPDATE PasswordResetToken t SET t.failedAttempts = t.failedAttempts + 1 WHERE t.id = :id")
  int recordFailure(@Param("id") Long id);

  @Modifying
  @Query(
      value =
          """
          DELETE FROM password_reset_tokens WHERE id IN (
            SELECT id FROM password_reset_tokens WHERE expires_at <= :now LIMIT :limit)
          """,
      nativeQuery = true)
  int deleteExpired(@Param("now") Instant now, @Param("limit") int limit);
}
