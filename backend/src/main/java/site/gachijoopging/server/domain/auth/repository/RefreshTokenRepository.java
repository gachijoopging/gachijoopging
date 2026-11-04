package site.gachijoopging.server.domain.auth.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.auth.entity.RefreshToken;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

  Optional<RefreshToken> findByTokenHash(String tokenHash);

  List<RefreshToken> findByFamilyId(UUID familyId);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(
      """
      UPDATE RefreshToken t SET t.revokedAt = :now
      WHERE t.familyId = :familyId AND t.revokedAt IS NULL
      """)
  int revokeFamily(@Param("familyId") UUID familyId, @Param("now") Instant now);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(
      """
      UPDATE RefreshToken t SET t.revokedAt = :now
      WHERE t.tokenHash = :tokenHash AND t.revokedAt IS NULL
      """)
  int revokeIfActive(@Param("tokenHash") String tokenHash, @Param("now") Instant now);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(
      """
      DELETE FROM RefreshToken t
      WHERE t.tokenHash = :tokenHash AND t.revokedAt IS NULL AND t.expiresAt > :now
      """)
  int deleteIfActive(@Param("tokenHash") String tokenHash, @Param("now") Instant now);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(
      """
      UPDATE RefreshToken t SET t.revokedAt = :now
      WHERE t.userId = :userId AND t.revokedAt IS NULL
      """)
  int revokeAllByUserId(@Param("userId") UUID userId, @Param("now") Instant now);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("DELETE FROM RefreshToken t WHERE t.userId = :userId")
  void deleteAllByUserId(@Param("userId") UUID userId);

  @Modifying
  @Query(
      value =
          """
          DELETE FROM refresh_tokens WHERE id IN (
            SELECT id FROM refresh_tokens WHERE expires_at <= :now LIMIT :limit)
          """,
      nativeQuery = true)
  int deleteExpired(@Param("now") Instant now, @Param("limit") int limit);
}
