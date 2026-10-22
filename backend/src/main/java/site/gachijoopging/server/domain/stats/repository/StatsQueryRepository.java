package site.gachijoopging.server.domain.stats.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

// 날짜 인자는 전부 KST 날짜다. activities 는 시작 시각의 KST 날짜로 자른다 — crew_daily_stats 가 그렇게 쌓인다
@Repository
@RequiredArgsConstructor
public class StatsQueryRepository {

  private static final String ENDED_ACTIVITY = "a.status = 'ENDED' AND a.deleted_at IS NULL";

  private static final String FROM_KST =
      "(CAST(:from AS date) IS NULL"
          + " OR a.started_at >= CAST(CAST(:from AS date) AS timestamp) AT TIME ZONE 'Asia/Seoul')";

  private final JdbcClient jdbc;

  // firstDay 는 ALL 추이의 첫 달이다. 크루가 생기기 전 날짜에 시작한 활동도 빠뜨리지 않는다
  public record CrewRow(UUID id, String name, int goalCount, LocalDate firstDay) {}

  public record DayRow(LocalDate date, long items, int activityCount) {}

  public record Totals(long items, long distanceM, long durationSec, long activities) {}

  public record UserRow(UUID id, String nickname, String status, String photoKey) {}

  public record RankRow(int rank, UserRow user, long items, long distanceM) {}

  public record CalendarActivityRow(
      UUID id, LocalDate date, Instant startedAt, UserRow user, int items, int distanceM) {}

  public record CardRow(
      UUID id, Instant startedAt, int durationSec, int distanceM, int itemCount, String thumbKey) {}

  public CrewRow crew(UUID crewId) {
    return jdbc.sql(
            """
            SELECT c.id, c.name, c.goal_count,
                   least(CAST(c.created_at AT TIME ZONE 'Asia/Seoul' AS date),
                         (SELECT min(s.date) FROM crew_daily_stats s WHERE s.crew_id = c.id))
                     AS first_day
            FROM crews c WHERE c.id = :crewId
            """)
        .param("crewId", crewId)
        .query(
            (rs, i) ->
                new CrewRow(
                    rs.getObject("id", UUID.class),
                    rs.getString("name"),
                    rs.getInt("goal_count"),
                    rs.getObject("first_day", LocalDate.class)))
        .single();
  }

  /** from~to 의 하루하루. 기록이 없는 날도 0 으로 싣는다. */
  public List<DayRow> daily(UUID crewId, LocalDate from, LocalDate to) {
    return jdbc.sql(
            """
            SELECT CAST(d AS date) AS date, coalesce(s.item_count, 0) AS items,
                   coalesce(s.activity_count, 0) AS activity_count
            FROM generate_series(CAST(:from AS date), CAST(:to AS date), interval '1 day') d
            LEFT JOIN crew_daily_stats s ON s.crew_id = :crewId AND s.date = CAST(d AS date)
            ORDER BY d
            """)
        .param("crewId", crewId)
        .param("from", from)
        .param("to", to)
        .query(StatsQueryRepository::day)
        .list();
  }

  /** from~to 를 달 단위로 묶는다. date 는 그 달 1일이다. */
  public List<DayRow> monthly(UUID crewId, LocalDate from, LocalDate to) {
    return jdbc.sql(
            """
            SELECT CAST(m AS date) AS date, coalesce(sum(s.item_count), 0) AS items,
                   coalesce(sum(s.activity_count), 0) AS activity_count
            FROM generate_series(date_trunc('month', CAST(:from AS date)),
                                 date_trunc('month', CAST(:to AS date)), interval '1 month') m
            LEFT JOIN crew_daily_stats s
              ON s.crew_id = :crewId AND date_trunc('month', s.date) = m
            GROUP BY m
            ORDER BY m
            """)
        .param("crewId", crewId)
        .param("from", from)
        .param("to", to)
        .query(StatsQueryRepository::day)
        .list();
  }

  /** 활동이 하나라도 있었던 날만. */
  public List<DayRow> activeDays(UUID crewId, LocalDate from, LocalDate to) {
    return jdbc.sql(
            """
            SELECT date, item_count AS items, activity_count
            FROM crew_daily_stats
            WHERE crew_id = :crewId AND date BETWEEN :from AND :to AND activity_count > 0
            ORDER BY date
            """)
        .param("crewId", crewId)
        .param("from", from)
        .param("to", to)
        .query(StatsQueryRepository::day)
        .list();
  }

  public Totals crewTotals(UUID crewId, LocalDate from) {
    return jdbc.sql(
            """
            SELECT coalesce(sum(item_count), 0) AS items, coalesce(sum(distance_m), 0) AS distance,
                   coalesce(sum(duration_sec), 0) AS duration,
                   coalesce(sum(activity_count), 0) AS activities
            FROM crew_daily_stats
            WHERE crew_id = :crewId AND (CAST(:from AS date) IS NULL OR date >= CAST(:from AS date))
            """)
        .param("crewId", crewId)
        .param("from", from)
        .query(
            (rs, i) ->
                new Totals(
                    rs.getLong("items"),
                    rs.getLong("distance"),
                    rs.getLong("duration"),
                    rs.getLong("activities")))
        .single();
  }

  public Map<String, Integer> crewByCategory(UUID crewId, LocalDate from) {
    return categories(
        jdbc.sql(
                """
                SELECT e.key, sum(e.value::int) AS quantity
                FROM crew_daily_stats s, jsonb_each_text(s.by_category) e
                WHERE s.crew_id = :crewId
                  AND (CAST(:from AS date) IS NULL OR s.date >= CAST(:from AS date))
                GROUP BY e.key
                HAVING sum(e.value::int) <> 0
                """)
            .param("crewId", crewId)
            .param("from", from));
  }

  public Map<String, Integer> myByCategory(UUID crewId, UUID userId, LocalDate from) {
    return categories(
        jdbc.sql(
                """
                SELECT e.key, sum(e.value::int) AS quantity
                FROM activities a, jsonb_each_text(a.by_category) e
                WHERE a.crew_id = :crewId AND a.user_id = :userId AND %s AND %s
                GROUP BY e.key
                HAVING sum(e.value::int) <> 0
                """
                    .formatted(ENDED_ACTIVITY, FROM_KST))
            .param("crewId", crewId)
            .param("userId", userId)
            .param("from", from));
  }

  // 순위는 지금 크루원만 — 나간 사람의 기록은 합계에는 남지만 순위에는 올리지 않는다
  public List<RankRow> ranking(UUID crewId, LocalDate from) {
    return jdbc.sql(
            """
            SELECT CAST(rank() OVER (ORDER BY sum(a.item_count) DESC) AS int) AS rank,
                   u.id, u.nickname, u.status, m.object_key AS photo_key,
                   sum(a.item_count) AS items, sum(a.distance_m) AS distance
            FROM activities a
            JOIN crew_members cm ON cm.crew_id = a.crew_id AND cm.user_id = a.user_id
            JOIN users u ON u.id = a.user_id
            LEFT JOIN media m ON m.id = u.photo_media_id
            WHERE a.crew_id = :crewId AND %s AND %s
            GROUP BY u.id, u.nickname, u.status, m.object_key
            ORDER BY rank, u.id
            """
                .formatted(ENDED_ACTIVITY, FROM_KST))
        .param("crewId", crewId)
        .param("from", from)
        .query(
            (rs, i) ->
                new RankRow(
                    rs.getInt("rank"), user(rs), rs.getLong("items"), rs.getLong("distance")))
        .list();
  }

  public List<CalendarActivityRow> calendarActivities(UUID crewId, LocalDate from, LocalDate to) {
    return jdbc.sql(
            """
            SELECT a.id AS activity_id,
                   CAST(a.started_at AT TIME ZONE 'Asia/Seoul' AS date) AS day, a.started_at,
                   a.item_count, a.distance_m,
                   u.id, u.nickname, u.status, m.object_key AS photo_key
            FROM activities a
            JOIN users u ON u.id = a.user_id
            LEFT JOIN media m ON m.id = u.photo_media_id
            WHERE a.crew_id = :crewId AND %s AND %s
              AND a.started_at < CAST(CAST(:to AS date) + 1 AS timestamp) AT TIME ZONE 'Asia/Seoul'
            ORDER BY a.started_at, a.id
            """
                .formatted(ENDED_ACTIVITY, FROM_KST))
        .param("crewId", crewId)
        .param("from", from)
        .param("to", to)
        .query(
            (rs, i) ->
                new CalendarActivityRow(
                    rs.getObject("activity_id", UUID.class),
                    rs.getObject("day", LocalDate.class),
                    instant(rs, "started_at"),
                    user(rs),
                    rs.getInt("item_count"),
                    rs.getInt("distance_m")))
        .list();
  }

  public Totals userTotals(UUID userId) {
    return jdbc.sql(
            """
            SELECT coalesce(sum(a.item_count), 0) AS items,
                   coalesce(sum(a.distance_m), 0) AS distance,
                   coalesce(sum(a.duration_sec), 0) AS duration, count(*) AS activities
            FROM activities a
            WHERE a.user_id = :userId AND %s
            """
                .formatted(ENDED_ACTIVITY))
        .param("userId", userId)
        .query(
            (rs, i) ->
                new Totals(
                    rs.getLong("items"),
                    rs.getLong("distance"),
                    rs.getLong("duration"),
                    rs.getLong("activities")))
        .single();
  }

  public List<LocalDate> userActiveDays(UUID userId, LocalDate from) {
    return jdbc.sql(
            """
            SELECT DISTINCT CAST(a.started_at AT TIME ZONE 'Asia/Seoul' AS date) AS day
            FROM activities a
            WHERE a.user_id = :userId AND %s AND %s
            ORDER BY day DESC
            """
                .formatted(ENDED_ACTIVITY, FROM_KST))
        .param("userId", userId)
        .param("from", from)
        .query((rs, i) -> rs.getObject("day", LocalDate.class))
        .list();
  }

  public long unreadNotifications(UUID userId) {
    return jdbc.sql("SELECT count(*) FROM notifications WHERE user_id = :userId AND unread")
        .param("userId", userId)
        .query(Long.class)
        .single();
  }

  public boolean isMember(UUID crewId, UUID userId) {
    return jdbc.sql(
            "SELECT EXISTS (SELECT 1 FROM crew_members WHERE crew_id = :crewId AND user_id = :userId)")
        .param("crewId", crewId)
        .param("userId", userId)
        .query(Boolean.class)
        .single();
  }

  // 기록 목록이라 끝난 활동만 싣는다. 진행 중 활동은 GET /activities/current 가 준다
  public List<CardRow> memberCards(
      UUID crewId, UUID userId, Optional<CardCursor> before, int limit) {
    JdbcClient.StatementSpec statement =
        jdbc.sql(
                """
                SELECT a.id, a.started_at, a.duration_sec, a.distance_m, a.item_count,
                       (SELECT m.thumb_key FROM activity_photos p JOIN media m ON m.id = p.media_id
                        WHERE p.activity_id = a.id ORDER BY p.order_index LIMIT 1) AS thumb_key
                FROM activities a
                WHERE a.crew_id = :crewId AND a.user_id = :userId AND %s %s
                ORDER BY a.started_at DESC, a.id DESC
                LIMIT :limit
                """
                    .formatted(
                        ENDED_ACTIVITY,
                        before.isPresent()
                            ? "AND (a.started_at, a.id) < (:beforeStartedAt, :beforeId)"
                            : ""))
            .param("crewId", crewId)
            .param("userId", userId)
            .param("limit", limit);
    before.ifPresent(
        c ->
            statement
                .param("beforeStartedAt", OffsetDateTime.ofInstant(c.startedAt(), ZoneOffset.UTC))
                .param("beforeId", c.id()));
    return statement
        .query(
            (rs, i) ->
                new CardRow(
                    rs.getObject("id", UUID.class),
                    instant(rs, "started_at"),
                    rs.getInt("duration_sec"),
                    rs.getInt("distance_m"),
                    rs.getInt("item_count"),
                    rs.getString("thumb_key")))
        .list();
  }

  public record CardCursor(Instant startedAt, UUID id) {}

  private static DayRow day(ResultSet rs, int rowNum) throws SQLException {
    return new DayRow(
        rs.getObject("date", LocalDate.class), rs.getLong("items"), rs.getInt("activity_count"));
  }

  private static UserRow user(ResultSet rs) throws SQLException {
    return new UserRow(
        rs.getObject("id", UUID.class),
        rs.getString("nickname"),
        rs.getString("status"),
        rs.getString("photo_key"));
  }

  private static Instant instant(ResultSet rs, String column) throws SQLException {
    return rs.getObject(column, OffsetDateTime.class).toInstant();
  }

  private static Map<String, Integer> categories(JdbcClient.StatementSpec statement) {
    Map<String, Integer> byCategory = new TreeMap<>();
    statement
        .query((rs, i) -> Map.entry(rs.getString("key"), rs.getInt("quantity")))
        .list()
        .forEach(e -> byCategory.put(e.getKey(), e.getValue()));
    return byCategory;
  }
}
