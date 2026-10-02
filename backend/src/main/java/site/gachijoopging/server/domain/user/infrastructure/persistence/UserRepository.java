package site.gachijoopging.server.domain.user.infrastructure.persistence;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.user.domain.entity.User;

public interface UserRepository extends JpaRepository<User, UUID> {

  Optional<User> findByEmail(String email);

  Optional<User> findByKakaoId(String kakaoId);

  Optional<User> findByGoogleSub(String googleSub);

  boolean existsByNicknameAndIdNot(String nickname, UUID id);

  @Modifying
  @Query(
      value =
          """
          INSERT INTO users (id, email, password_hash, created_at, updated_at)
          VALUES (:id, :email, :passwordHash, :now, :now)
          ON CONFLICT (email) DO NOTHING
          """,
      nativeQuery = true)
  int insertEmailIfAbsent(
      @Param("id") UUID id,
      @Param("email") String email,
      @Param("passwordHash") String passwordHash,
      @Param("now") Instant now);

  @Modifying
  @Query(
      value =
          """
          INSERT INTO users (id, kakao_id, created_at, updated_at)
          VALUES (:id, :kakaoId, :now, :now)
          ON CONFLICT (kakao_id) DO NOTHING
          """,
      nativeQuery = true)
  int insertKakaoIfAbsent(
      @Param("id") UUID id, @Param("kakaoId") String kakaoId, @Param("now") Instant now);

  @Modifying
  @Query(
      value =
          """
          INSERT INTO users (id, google_sub, created_at, updated_at)
          VALUES (:id, :googleSub, :now, :now)
          ON CONFLICT (google_sub) DO NOTHING
          """,
      nativeQuery = true)
  int insertGoogleIfAbsent(
      @Param("id") UUID id, @Param("googleSub") String googleSub, @Param("now") Instant now);
}
