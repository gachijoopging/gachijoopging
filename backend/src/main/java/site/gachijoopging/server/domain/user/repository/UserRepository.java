package site.gachijoopging.server.domain.user.repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.user.entity.User;

public interface UserRepository extends JpaRepository<User, UUID> {

  Optional<User> findByEmail(String email);

  Optional<User> findByKakaoId(String kakaoId);

  Optional<User> findByGoogleSub(String googleSub);

  boolean existsByEmail(String email);

  boolean existsByNicknameAndIdNot(String nickname, UUID id);

  @Modifying
  @Query(
      value =
          """
          INSERT INTO users (id, email, password_hash, nickname, created_at, updated_at)
          VALUES (:id, :email, :passwordHash, :nickname, :now, :now)
          ON CONFLICT DO NOTHING
          """,
      nativeQuery = true)
  int insertEmailIfAbsent(
      @Param("id") UUID id,
      @Param("email") String email,
      @Param("passwordHash") String passwordHash,
      @Param("nickname") String nickname,
      @Param("now") Instant now);

  @Modifying
  @Query(
      value =
          """
          INSERT INTO users (id, kakao_id, nickname, created_at, updated_at)
          VALUES (:id, :kakaoId, :nickname, :now, :now)
          ON CONFLICT DO NOTHING
          """,
      nativeQuery = true)
  int insertKakaoIfAbsent(
      @Param("id") UUID id,
      @Param("kakaoId") String kakaoId,
      @Param("nickname") String nickname,
      @Param("now") Instant now);

  @Modifying
  @Query(
      value =
          """
          INSERT INTO users (id, google_sub, nickname, created_at, updated_at)
          VALUES (:id, :googleSub, :nickname, :now, :now)
          ON CONFLICT DO NOTHING
          """,
      nativeQuery = true)
  int insertGoogleIfAbsent(
      @Param("id") UUID id,
      @Param("googleSub") String googleSub,
      @Param("nickname") String nickname,
      @Param("now") Instant now);

  // 같은 기기에 다른 계정으로 로그인하면 토큰의 주인이 바뀐다
  @Modifying
  @Query(
      value =
          """
          INSERT INTO devices (push_token, user_id, platform, created_at, updated_at)
          VALUES (:pushToken, :userId, :platform, :now, :now)
          ON CONFLICT (push_token)
          DO UPDATE SET user_id = :userId, platform = :platform, updated_at = :now
          """,
      nativeQuery = true)
  void upsertDevice(
      @Param("pushToken") String pushToken,
      @Param("userId") UUID userId,
      @Param("platform") String platform,
      @Param("now") Instant now);

  // 계약이 204 뿐이라 자기 자신·다른 크루·없는 사용자는 오류 없이 넣지 않는다. 팔로우는 같은 크루 안에서만이다 (ERD follows)
  @Modifying
  @Query(
      value =
          """
          INSERT INTO follows (follower_id, followee_id, created_at)
          SELECT mine.user_id, other.user_id, :now
          FROM crew_members mine JOIN crew_members other ON other.crew_id = mine.crew_id
          WHERE mine.user_id = :followerId AND other.user_id = :followeeId
            AND other.user_id <> mine.user_id
          ON CONFLICT DO NOTHING
          """,
      nativeQuery = true)
  void followIfSameCrew(
      @Param("followerId") UUID followerId,
      @Param("followeeId") UUID followeeId,
      @Param("now") Instant now);

  @Modifying
  @Query(
      value = "DELETE FROM follows WHERE follower_id = :followerId AND followee_id = :followeeId",
      nativeQuery = true)
  void unfollow(@Param("followerId") UUID followerId, @Param("followeeId") UUID followeeId);
}
