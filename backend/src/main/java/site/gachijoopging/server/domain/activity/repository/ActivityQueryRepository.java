package site.gachijoopging.server.domain.activity.repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.activity.entity.Activity;

public interface ActivityQueryRepository extends Repository<Activity, UUID> {

  interface UserRow {
    UUID getId();

    String getNickname();

    String getStatus();

    String getPhotoKey();
  }

  @Query(
      value =
          """
          SELECT u.id AS id, u.nickname AS nickname, u.status AS status, m.object_key AS photoKey
          FROM users u LEFT JOIN media m ON m.id = u.photo_media_id
          WHERE u.id = :userId
          """,
      nativeQuery = true)
  UserRow findUser(@Param("userId") UUID userId);

  interface PhotoRow {
    UUID getId();

    String getObjectKey();

    String getThumbKey();

    Instant getTakenAt();
  }

  @Query(
      value =
          """
          SELECT p.id AS id, m.object_key AS objectKey, m.thumb_key AS thumbKey,
                 p.taken_at AS takenAt
          FROM activity_photos p JOIN media m ON m.id = p.media_id
          WHERE p.activity_id = :activityId
          ORDER BY p.order_index
          """,
      nativeQuery = true)
  List<PhotoRow> findPhotos(@Param("activityId") UUID activityId);

  interface PointRow {
    double getLng();

    double getLat();
  }

  @Query(
      value =
          """
          SELECT ST_X(d.geom) AS lng, ST_Y(d.geom) AS lat
          FROM activities a, ST_DumpPoints(a.route) d
          WHERE a.id = :activityId
          ORDER BY d.path
          """,
      nativeQuery = true)
  List<PointRow> findRoute(@Param("activityId") UUID activityId);

  interface CardRow {
    UUID getId();

    Instant getStartedAt();

    int getDurationSec();

    int getDistanceM();

    int getItemCount();

    String getThumbKey();
  }

  // 기록 목록이라 끝난 활동만 싣는다. 진행 중 활동은 GET /activities/current 가 준다
  String MINE =
      """
      SELECT a.id AS id, a.started_at AS startedAt, a.duration_sec AS durationSec,
             a.distance_m AS distanceM, a.item_count AS itemCount,
             (SELECT m.thumb_key FROM activity_photos p JOIN media m ON m.id = p.media_id
              WHERE p.activity_id = a.id ORDER BY p.order_index LIMIT 1) AS thumbKey
      FROM activities a
      WHERE a.user_id = :userId AND a.status = 'ENDED' AND a.deleted_at IS NULL
      """;

  @Query(value = MINE + " ORDER BY a.started_at DESC, a.id DESC LIMIT :limit", nativeQuery = true)
  List<CardRow> findMine(@Param("userId") UUID userId, @Param("limit") int limit);

  @Query(
      value =
          MINE
              + " AND (a.started_at, a.id) < (:beforeStartedAt, :beforeId)"
              + " ORDER BY a.started_at DESC, a.id DESC LIMIT :limit",
      nativeQuery = true)
  List<CardRow> findMineBefore(
      @Param("userId") UUID userId,
      @Param("beforeStartedAt") Instant beforeStartedAt,
      @Param("beforeId") UUID beforeId,
      @Param("limit") int limit);
}
