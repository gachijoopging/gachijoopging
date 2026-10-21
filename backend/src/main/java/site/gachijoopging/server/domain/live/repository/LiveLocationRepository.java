package site.gachijoopging.server.domain.live.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import site.gachijoopging.server.domain.live.dto.LngLat;

@Repository
@RequiredArgsConstructor
public class LiveLocationRepository {

  private static final String MEMBER_SELECT =
      """
      SELECT l.user_id, u.nickname, u.status AS user_status, m.object_key AS photo_key,
             l.activity_id, a.started_at, l.elapsed_sec, l.distance_m, l.item_count, l.paused,
             a.location_shared, ST_X(l.point) AS lng, ST_Y(l.point) AS lat
      FROM live_locations l
      JOIN activities a ON a.id = l.activity_id
      JOIN users u ON u.id = l.user_id
      LEFT JOIN media m ON m.id = u.photo_media_id
      WHERE a.status = 'IN_PROGRESS' AND a.deleted_at IS NULL
      """;

  private final JdbcClient jdbc;

  public record ActivityRow(UUID userId, UUID crewId, boolean locationShared) {}

  public record LiveMemberRow(
      UUID userId,
      String nickname,
      String userStatus,
      String photoKey,
      UUID activityId,
      Instant startedAt,
      int elapsedSec,
      int distanceM,
      int itemCount,
      boolean paused,
      boolean locationShared,
      LngLat location) {}

  public Optional<ActivityRow> findActivity(UUID activityId) {
    return jdbc.sql(
            """
            SELECT user_id, crew_id, location_shared FROM activities
            WHERE id = :id AND deleted_at IS NULL
            """)
        .param("id", activityId)
        .query(
            (rs, i) ->
                new ActivityRow(
                    rs.getObject("user_id", UUID.class),
                    rs.getObject("crew_id", UUID.class),
                    rs.getBoolean("location_shared")))
        .optional();
  }

  // 종료와 엇갈린 보고가 끝난 활동의 행을 되살리지 않게 한다. FOR SHARE 가 종료의 FOR UPDATE 커밋을
  // 기다린 뒤 상태를 다시 판정한다 — 없으면 READ COMMITTED 스냅샷이 진행 중으로 보고 INSERT 한다
  public int upsertIfInProgress(
      UUID activityId,
      LngLat location,
      int distanceM,
      int itemCount,
      int elapsedSec,
      boolean paused,
      Instant now) {
    return jdbc.sql(
            """
            INSERT INTO live_locations (user_id, activity_id, crew_id, point, paused, distance_m,
                                        item_count, elapsed_sec, updated_at)
            SELECT a.user_id, a.id, a.crew_id,
                   ST_SetSRID(ST_MakePoint(CAST(:lng AS double precision),
                                           CAST(:lat AS double precision)), 4326),
                   :paused, :distanceM, :itemCount, :elapsedSec, :now
            FROM activities a
            WHERE a.id = :activityId AND a.status = 'IN_PROGRESS' AND a.deleted_at IS NULL
            FOR SHARE OF a
            ON CONFLICT (user_id) DO UPDATE SET
              activity_id = EXCLUDED.activity_id, crew_id = EXCLUDED.crew_id,
              point = EXCLUDED.point, paused = EXCLUDED.paused, distance_m = EXCLUDED.distance_m,
              item_count = EXCLUDED.item_count, elapsed_sec = EXCLUDED.elapsed_sec,
              updated_at = EXCLUDED.updated_at
            """)
        .param("activityId", activityId)
        .param("lng", location == null ? null : location.lng())
        .param("lat", location == null ? null : location.lat())
        .param("paused", paused)
        .param("distanceM", distanceM)
        .param("itemCount", itemCount)
        .param("elapsedSec", elapsedSec)
        .param("now", OffsetDateTime.ofInstant(now, ZoneOffset.UTC))
        .update();
  }

  public void delete(UUID userId, UUID activityId) {
    jdbc.sql("DELETE FROM live_locations WHERE user_id = :userId AND activity_id = :activityId")
        .param("userId", userId)
        .param("activityId", activityId)
        .update();
  }

  // 차단은 한 방향이다. 내가 막은 사람만 내 목록에서 빠진다
  public List<LiveMemberRow> findCrew(UUID crewId, UUID viewer) {
    return jdbc.sql(
            MEMBER_SELECT
                + """
                  AND l.crew_id = :crewId
                  AND NOT EXISTS (SELECT 1 FROM blocks b
                                  WHERE b.blocker_id = :viewer AND b.blocked_id = l.user_id)
                ORDER BY a.started_at, l.user_id
                """)
        .param("crewId", crewId)
        .param("viewer", viewer)
        .query(LiveLocationRepository::member)
        .list();
  }

  public boolean exists(UUID userId, UUID activityId) {
    return jdbc.sql(
            """
            SELECT EXISTS (SELECT 1 FROM live_locations
                           WHERE user_id = :userId AND activity_id = :activityId)
            """)
        .param("userId", userId)
        .param("activityId", activityId)
        .query(Boolean.class)
        .single();
  }

  public Optional<LiveMemberRow> findMember(UUID userId) {
    return jdbc.sql(MEMBER_SELECT + " AND l.user_id = :userId")
        .param("userId", userId)
        .query(LiveLocationRepository::member)
        .optional();
  }

  public List<UUID> findRecipients(UUID crewId, UUID sender) {
    return jdbc.sql(
            """
            SELECT m.user_id FROM crew_members m
            WHERE m.crew_id = :crewId
              AND m.user_id <> :sender
              AND NOT EXISTS (SELECT 1 FROM blocks b
                              WHERE b.blocker_id = m.user_id AND b.blocked_id = :sender)
            """)
        .param("crewId", crewId)
        .param("sender", sender)
        .query(UUID.class)
        .list();
  }

  private static LiveMemberRow member(ResultSet rs, int rowNum) throws SQLException {
    Double lng = rs.getObject("lng", Double.class);
    Double lat = rs.getObject("lat", Double.class);
    return new LiveMemberRow(
        rs.getObject("user_id", UUID.class),
        rs.getString("nickname"),
        rs.getString("user_status"),
        rs.getString("photo_key"),
        rs.getObject("activity_id", UUID.class),
        rs.getObject("started_at", OffsetDateTime.class).toInstant(),
        rs.getInt("elapsed_sec"),
        rs.getInt("distance_m"),
        rs.getInt("item_count"),
        rs.getBoolean("paused"),
        rs.getBoolean("location_shared"),
        lng == null || lat == null ? null : new LngLat(lng, lat));
  }
}
