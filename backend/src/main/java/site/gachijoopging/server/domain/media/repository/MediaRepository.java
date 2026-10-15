package site.gachijoopging.server.domain.media.repository;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.media.entity.Media;

public interface MediaRepository extends JpaRepository<Media, UUID> {

  long countByOwnerIdAndCreatedAtGreaterThanEqual(UUID ownerId, Instant from);

  boolean existsByIdAndOwnerId(UUID id, UUID ownerId);

  // 지우는 동안 프로필·크루 사진으로 지정되거나 같은 삭제가 겹치지 않도록 줄 세운다
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("SELECT m FROM Media m WHERE m.id = :id")
  Optional<Media> findForUpdate(@Param("id") UUID id);

  @Query(value = "select count(*) from users where photo_media_id is not null", nativeQuery = true)
  long countReferencedByUsers();

  @Query(value = "select count(*) from post_media", nativeQuery = true)
  long countReferencedByPosts();

  @Query(value = "select count(*) from activity_photos", nativeQuery = true)
  long countReferencedByActivities();

  // id 는 앱이 만든다. save() 는 있는 행을 덮어쓰므로 동시 재전송은 충돌 시 아무것도 하지 않는다
  @Modifying
  @Query(
      value =
          """
          INSERT INTO media (id, owner_id, object_key, thumb_key, created_at)
          VALUES (:id, :ownerId, :objectKey, :thumbKey, :createdAt)
          ON CONFLICT (id) DO NOTHING
          """,
      nativeQuery = true)
  void insertIfAbsent(
      @Param("id") UUID id,
      @Param("ownerId") UUID ownerId,
      @Param("objectKey") String objectKey,
      @Param("thumbKey") String thumbKey,
      @Param("createdAt") Instant createdAt);

  // 이 참조들은 ON DELETE SET NULL 이거나 막지 않아, 지우면 프로필·크루 사진이 조용히 비거나 게시물이 깨진다
  @Query(
      value =
          """
          SELECT EXISTS (SELECT 1 FROM users WHERE photo_media_id = :id)
              OR EXISTS (SELECT 1 FROM crews WHERE photo_media_id = :id)
              OR EXISTS (SELECT 1 FROM post_media WHERE media_id = :id)
          """,
      nativeQuery = true)
  boolean isUsedOutsideActivities(@Param("id") UUID id);

  @Modifying
  @Query("update Media m set m.objectKey = :toKey where m.objectKey = :fromKey")
  void quarantineObjectKey(@Param("fromKey") String fromKey, @Param("toKey") String toKey);

  @Modifying
  @Query("update Media m set m.thumbKey = :toKey where m.thumbKey = :fromKey")
  void quarantineThumbKey(@Param("fromKey") String fromKey, @Param("toKey") String toKey);
}
