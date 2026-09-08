package site.gachijoopging.server.domain.media.infrastructure.persistence;

import java.time.Instant;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.media.domain.entity.Media;

public interface MediaRepository extends JpaRepository<Media, UUID> {

  long countByOwnerIdAndCreatedAtGreaterThanEqual(UUID ownerId, Instant from);

  boolean existsByIdAndOwnerId(UUID id, UUID ownerId);

  @Query(value = "select count(*) from users where photo_media_id is not null", nativeQuery = true)
  long countReferencedByUsers();

  @Query(value = "select count(*) from post_media", nativeQuery = true)
  long countReferencedByPosts();

  @Query(value = "select count(*) from activity_items", nativeQuery = true)
  long countReferencedByActivities();

  @Modifying
  @Query("update Media m set m.objectKey = :toKey where m.objectKey = :fromKey")
  void quarantineObjectKey(@Param("fromKey") String fromKey, @Param("toKey") String toKey);

  @Modifying
  @Query("update Media m set m.thumbKey = :toKey where m.thumbKey = :fromKey")
  void quarantineThumbKey(@Param("fromKey") String fromKey, @Param("toKey") String toKey);
}
