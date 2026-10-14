package site.gachijoopging.server.domain.activity.repository;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.activity.entity.Activity;
import site.gachijoopging.server.domain.activity.entity.ActivityStatus;

public interface ActivityRepository extends JpaRepository<Activity, UUID> {

  @Query("SELECT a FROM Activity a WHERE a.id = :id AND a.deletedAt IS NULL")
  Optional<Activity> findLive(@Param("id") UUID id);

  // 줍기 합계·일시정지 누적을 고치는 요청끼리 같은 활동에서 줄 세운다
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("SELECT a FROM Activity a WHERE a.id = :id AND a.deletedAt IS NULL")
  Optional<Activity> findLiveForUpdate(@Param("id") UUID id);

  @Query(
      "SELECT a FROM Activity a"
          + " WHERE a.userId = :userId AND a.status = 'IN_PROGRESS' AND a.deletedAt IS NULL")
  Optional<Activity> findInProgress(@Param("userId") UUID userId);

  boolean existsByUserIdAndStatusAndDeletedAtIsNull(UUID userId, ActivityStatus status);

  // 시작 시점의 소속을 사용자 잠금 뒤에 다시 읽는다. 나가기가 같은 잠금을 잡으므로 이 값은 커밋까지 유효하다
  @Query(
      value =
          """
          SELECT m.crew_id FROM crew_members m JOIN crews c ON c.id = m.crew_id
          WHERE m.user_id = :userId AND c.deleted_at IS NULL
          """,
      nativeQuery = true)
  Optional<UUID> findCrewOf(@Param("userId") UUID userId);

  @Modifying
  @Query(
      value =
          """
          INSERT INTO activities (id, user_id, crew_id, status, started_at, location_shared)
          VALUES (:id, :userId, :crewId, 'IN_PROGRESS', :startedAt, :locationShared)
          ON CONFLICT DO NOTHING
          """,
      nativeQuery = true)
  int insertIfAbsent(
      @Param("id") UUID id,
      @Param("userId") UUID userId,
      @Param("crewId") UUID crewId,
      @Param("startedAt") Instant startedAt,
      @Param("locationShared") boolean locationShared);

  @Query(
      value =
          "SELECT EXISTS (SELECT 1 FROM activity_photos WHERE id = :photoId AND activity_id = :activityId)",
      nativeQuery = true)
  boolean hasPhoto(@Param("activityId") UUID activityId, @Param("photoId") UUID photoId);

  interface PhotoRow {
    UUID getId();

    UUID getActivityId();
  }

  @Query(
      value = "SELECT id, activity_id AS activityId FROM activity_photos WHERE media_id = :mediaId",
      nativeQuery = true)
  Optional<PhotoRow> findPhotoByMedia(@Param("mediaId") UUID mediaId);

  // 같은 사진의 재전송은 media_id UNIQUE 로 흡수한다. 순번은 활동 행을 잠근 뒤라 겹치지 않는다
  @Modifying
  @Query(
      value =
          """
          INSERT INTO activity_photos (id, activity_id, media_id, point, taken_at, inference_status,
                                       model_version, inference_ms, order_index)
          VALUES (:id, :activityId, :mediaId,
                  ST_SetSRID(ST_MakePoint(CAST(:lng AS double precision),
                                          CAST(:lat AS double precision)), 4326),
                  :takenAt, :inferenceStatus, CAST(:modelVersion AS text),
                  CAST(:inferenceMs AS integer),
                  (SELECT COALESCE(max(order_index) + 1, 0) FROM activity_photos
                   WHERE activity_id = :activityId))
          ON CONFLICT (media_id) DO NOTHING
          """,
      nativeQuery = true)
  void insertPhotoIfAbsent(
      @Param("id") UUID id,
      @Param("activityId") UUID activityId,
      @Param("mediaId") UUID mediaId,
      @Param("lat") Double lat,
      @Param("lng") Double lng,
      @Param("takenAt") Instant takenAt,
      @Param("inferenceStatus") String inferenceStatus,
      @Param("modelVersion") String modelVersion,
      @Param("inferenceMs") Integer inferenceMs);

  @Query(
      value = "SELECT EXISTS (SELECT 1 FROM activity_items WHERE photo_id = :photoId)",
      nativeQuery = true)
  boolean hasItemsOn(@Param("photoId") UUID photoId);

  @Modifying
  @Query(value = "DELETE FROM activity_photos WHERE id = :photoId", nativeQuery = true)
  void deletePhoto(@Param("photoId") UUID photoId);
}
