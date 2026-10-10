package site.gachijoopging.server.seed;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

// 스테이징을 두지 않아(ADR-0005) 데모 데이터는 운영 서버에서 플래그로만 켠다. 기본은 꺼짐이다.
// 활동·피드·채팅 도메인보다 먼저 필요해 도메인 코드를 거치지 않고 테이블에 바로 넣는다.
@Slf4j
@Component
@ConditionalOnProperty(name = "app.seed.demo.enabled", havingValue = "true")
public class DemoSeedRunner implements ApplicationRunner {

  static final String DEMO_CREW_NAME = "가치줍깅 데모크루";
  static final String APPROVAL_CREW_NAME = "가치줍깅 비공개크루";

  private static final List<String> NICKNAMES =
      List.of("데모크루장", "데모크루원1", "데모크루원2", "데모멤버", "비공개크루장", "데모게스트");

  private static final ZoneId KST = ZoneId.of("Asia/Seoul");

  private static final ObjectMapper JSON = new ObjectMapper();

  private final JdbcClient jdbc;
  private final PasswordEncoder passwordEncoder;
  private final Clock clock;
  private final Account member;
  private final Account guest;

  record Account(String email, String password) {}

  private record Activity(
      String key,
      String user,
      String crew,
      int daysAgo,
      int minutes,
      int distanceM,
      Integer steps,
      Map<String, Integer> byCategory) {}

  public DemoSeedRunner(
      JdbcClient jdbc,
      PasswordEncoder passwordEncoder,
      Clock clock,
      @Value("${app.seed.demo.member-email:}") String memberEmail,
      @Value("${app.seed.demo.member-password:}") String memberPassword,
      @Value("${app.seed.demo.guest-email:}") String guestEmail,
      @Value("${app.seed.demo.guest-password:}") String guestPassword) {
    if (memberEmail.isBlank()
        || memberPassword.isBlank()
        || guestEmail.isBlank()
        || guestPassword.isBlank()) {
      throw new IllegalStateException(
          "DEMO_SEED_ENABLED 를 켰으면 DEMO_MEMBER_EMAIL·PASSWORD, DEMO_GUEST_EMAIL·PASSWORD 를 모두 넣는다");
    }
    this.jdbc = jdbc;
    this.passwordEncoder = passwordEncoder;
    this.clock = clock;
    this.member = new Account(memberEmail, memberPassword);
    this.guest = new Account(guestEmail, guestPassword);
  }

  @Override
  @Transactional
  public void run(ApplicationArguments args) {
    Instant now = clock.instant();
    if (takenByOthers()) {
      // 운영 서버에서 켜는 러너라, 남이 쓰는 값과 겹치면 기동을 죽이지 않고 시드 전체를 건너뛴다
      log.warn("데모 시드를 건너뛴다 — 시드의 이메일·닉네임·크루 이름을 다른 행이 이미 쓴다");
      return;
    }

    user("leader", null, null, "데모크루장", now);
    user("member1", null, null, "데모크루원1", now);
    user("member2", null, null, "데모크루원2", now);
    user("member", member.email(), member.password(), "데모멤버", now);
    user("approvalLeader", null, null, "비공개크루장", now);
    user("guest", guest.email(), guest.password(), "데모게스트", now);

    crew("demo", DEMO_CREW_NAME, "매주 토요일 아침 한강에서 줍깅해요", "leader", "SEOUL", "OPEN", now);
    crew(
        "approval", APPROVAL_CREW_NAME, "승인 후 함께해요", "approvalLeader", "GYEONGGI", "APPROVAL", now);
    for (String user : List.of("leader", "member1", "member2", "member")) {
      membership("demo", user, now);
    }
    membership("approval", "approvalLeader", now);

    List<Activity> activities =
        List.of(
            new Activity(
                "a1", "leader", "demo", 1, 42, 2_800, 3_900, Map.of("CIGARETTE", 14, "PLASTIC", 4)),
            new Activity("a2", "member", "demo", 1, 35, 2_100, 2_950, Map.of("CAN", 3, "PAPER", 2)),
            new Activity(
                "a3", "member1", "demo", 3, 50, 3_400, null, Map.of("CIGARETTE", 9, "VINYL", 2)),
            new Activity(
                "a4", "member2", "demo", 4, 28, 1_600, 2_200, Map.of("PLASTIC", 5, "GENERAL", 1)),
            new Activity(
                "a5", "member", "demo", 6, 47, 3_000, 4_100, Map.of("CIGARETTE", 11, "GLASS", 1)),
            new Activity("a6", "leader", "demo", 6, 31, 1_900, 2_600, Map.of("CAN", 4, "PAPER", 3)),
            // 미가입자도 1-6 에서 본인 기록을 본다 — 나가기 전 비공개 크루에서 한 활동으로 둔다
            new Activity("g1", "guest", "approval", 10, 40, 2_500, 3_300, Map.of("CIGARETTE", 7)),
            new Activity(
                "g2", "guest", "approval", 12, 25, 1_400, null, Map.of("PLASTIC", 3, "CAN", 1)));
    // 활동은 첫 실행 시각에 고정된다. 통계는 이번에 새로 넣은 활동만 더해야 다음 날 재실행에 부풀지 않는다
    List<Activity> inserted =
        activities.stream().filter(activity -> activity(activity, now)).toList();
    dailyStats(inserted, now);
    log.info("데모 시드 완료 — 새로 넣은 활동 {}건", inserted.size());

    post("p1", "demo", "member", "오늘 한강 둔치에서 담배꽁초를 잔뜩 주웠어요", now.minus(Duration.ofDays(1)));
    post("p2", "demo", "leader", "이번 주 토요일도 여의나루역 2번 출구에서 만나요", now.minus(Duration.ofDays(3)));
    notice(
        "n1",
        "demo",
        "leader",
        "이번 달 정기 줍깅",
        "매주 토요일 오전 9시, 여의나루역 2번 출구",
        now.minus(Duration.ofDays(5)));
    chat("c1", "demo", 1, "leader", "내일 9시 여의나루 어때요?", now.minus(Duration.ofHours(20)));
    chat("c2", "demo", 2, "member1", "좋아요! 집게 챙겨갈게요", now.minus(Duration.ofHours(19)));
    chat("c3", "demo", 3, "member", "저도 갈게요", now.minus(Duration.ofHours(18)));
  }

  private boolean takenByOthers() {
    List<UUID> userIds =
        List.of("leader", "member1", "member2", "member", "approvalLeader", "guest").stream()
            .map(key -> id("user:" + key))
            .toList();
    return jdbc.sql(
            """
            SELECT EXISTS (
              SELECT 1 FROM users
              WHERE (email IN (:emails) OR nickname IN (:nicknames)) AND id NOT IN (:userIds)
            ) OR EXISTS (
              SELECT 1 FROM crews WHERE name IN (:crewNames) AND id NOT IN (:crewIds)
            )
            """)
        .param("emails", List.of(member.email(), guest.email()))
        .param("nicknames", NICKNAMES)
        .param("userIds", userIds)
        .param("crewNames", List.of(DEMO_CREW_NAME, APPROVAL_CREW_NAME))
        .param("crewIds", List.of(id("crew:demo"), id("crew:approval")))
        .query(Boolean.class)
        .single();
  }

  static UUID id(String key) {
    return UUID.nameUUIDFromBytes(("gachijoopging-demo:" + key).getBytes(StandardCharsets.UTF_8));
  }

  private void user(String key, String email, String password, String nickname, Instant now) {
    jdbc.sql(
            """
            INSERT INTO users (id, email, password_hash, nickname, created_at, updated_at)
            VALUES (:id, :email, :passwordHash, :nickname, :now, :now)
            ON CONFLICT (id) DO NOTHING
            """)
        .param("id", id("user:" + key))
        .param("email", email)
        .param("passwordHash", password == null ? null : passwordEncoder.encode(password))
        .param("nickname", nickname)
        .param("now", Timestamp.from(now))
        .update();
  }

  private void crew(
      String key,
      String name,
      String intro,
      String leader,
      String region,
      String joinPolicy,
      Instant now) {
    jdbc.sql(
            """
            INSERT INTO crews (id, name, intro, leader_id, region, join_policy, created_at, updated_at)
            VALUES (:id, :name, :intro, :leaderId, :region, :joinPolicy, :now, :now)
            ON CONFLICT (id) DO NOTHING
            """)
        .param("id", id("crew:" + key))
        .param("name", name)
        .param("intro", intro)
        .param("leaderId", id("user:" + leader))
        .param("region", region)
        .param("joinPolicy", joinPolicy)
        .param("now", Timestamp.from(now))
        .update();
  }

  private void membership(String crew, String user, Instant now) {
    jdbc.sql(
            """
            INSERT INTO crew_members (crew_id, user_id, joined_at) VALUES (:crewId, :userId, :now)
            ON CONFLICT DO NOTHING
            """)
        .param("crewId", id("crew:" + crew))
        .param("userId", id("user:" + user))
        .param("now", Timestamp.from(now))
        .update();
  }

  private boolean activity(Activity activity, Instant now) {
    Instant endedAt = now.minus(Duration.ofDays(activity.daysAgo()));
    Instant startedAt = endedAt.minus(Duration.ofMinutes(activity.minutes()));
    int itemCount = activity.byCategory().values().stream().mapToInt(Integer::intValue).sum();
    UUID activityId = id("activity:" + activity.key());
    int inserted =
        jdbc.sql(
                """
                INSERT INTO activities (id, user_id, crew_id, status, started_at, ended_at,
                                        duration_sec, distance_m, steps, location_shared,
                                        item_count, by_category, created_at)
                VALUES (:id, :userId, :crewId, 'ENDED', :startedAt, :endedAt, :durationSec,
                        :distanceM, :steps, false, :itemCount, CAST(:byCategory AS jsonb), :startedAt)
                ON CONFLICT (id) DO NOTHING
                """)
            .param("id", activityId)
            .param("userId", id("user:" + activity.user()))
            .param("crewId", id("crew:" + activity.crew()))
            .param("startedAt", Timestamp.from(startedAt))
            .param("endedAt", Timestamp.from(endedAt))
            .param("durationSec", activity.minutes() * 60)
            .param("distanceM", activity.distanceM())
            .param("steps", activity.steps())
            .param("itemCount", itemCount)
            .param("byCategory", json(activity.byCategory()))
            .update();
    if (inserted == 0) {
      return false;
    }
    activity
        .byCategory()
        .forEach(
            (category, quantity) ->
                jdbc.sql(
                        """
                        INSERT INTO activity_items (id, activity_id, final_category, quantity,
                                                    unclassified, source)
                        VALUES (:id, :activityId, :category, :quantity, false, 'MANUAL')
                        """)
                    .param("id", id("item:" + activity.key() + ":" + category))
                    .param("activityId", activityId)
                    .param("category", category)
                    .param("quantity", quantity)
                    .update());
    return true;
  }

  private void dailyStats(List<Activity> activities, Instant now) {
    record Key(String crew, LocalDate date) {}
    Map<Key, List<Activity>> byDay = new LinkedHashMap<>();
    for (Activity activity : activities) {
      LocalDate date = now.minus(Duration.ofDays(activity.daysAgo())).atZone(KST).toLocalDate();
      byDay.computeIfAbsent(new Key(activity.crew(), date), k -> new ArrayList<>()).add(activity);
    }
    byDay.forEach(
        (key, day) -> {
          Map<String, Integer> byCategory = new TreeMap<>();
          day.forEach(a -> a.byCategory().forEach((c, q) -> byCategory.merge(c, q, Integer::sum)));
          jdbc.sql(
                  """
                  INSERT INTO crew_daily_stats (crew_id, date, item_count, distance_m, duration_sec,
                                                activity_count, by_category)
                  VALUES (:crewId, :date, :itemCount, :distanceM, :durationSec, :activityCount,
                          CAST(:byCategory AS jsonb))
                  ON CONFLICT (crew_id, date) DO UPDATE SET
                    item_count = crew_daily_stats.item_count + EXCLUDED.item_count,
                    distance_m = crew_daily_stats.distance_m + EXCLUDED.distance_m,
                    duration_sec = crew_daily_stats.duration_sec + EXCLUDED.duration_sec,
                    activity_count = crew_daily_stats.activity_count + EXCLUDED.activity_count,
                    by_category = (
                      SELECT coalesce(jsonb_object_agg(key, total), '{}')
                      FROM (
                        SELECT key, sum(value::int) AS total
                        FROM (
                          SELECT * FROM jsonb_each_text(crew_daily_stats.by_category)
                          UNION ALL
                          SELECT * FROM jsonb_each_text(EXCLUDED.by_category)
                        ) e
                        GROUP BY key
                      ) s
                    )
                  """)
              .param("crewId", id("crew:" + key.crew()))
              .param("date", key.date())
              .param("itemCount", byCategory.values().stream().mapToInt(Integer::intValue).sum())
              .param("distanceM", day.stream().mapToInt(Activity::distanceM).sum())
              .param("durationSec", day.stream().mapToInt(a -> a.minutes() * 60).sum())
              .param("activityCount", day.size())
              .param("byCategory", json(byCategory))
              .update();
        });
  }

  private void post(String key, String crew, String author, String text, Instant at) {
    jdbc.sql(
            """
            INSERT INTO posts (id, crew_id, author_id, text, visibility, created_at, updated_at)
            VALUES (:id, :crewId, :authorId, :text, 'CREW', :at, :at)
            ON CONFLICT DO NOTHING
            """)
        .param("id", id("post:" + key))
        .param("crewId", id("crew:" + crew))
        .param("authorId", id("user:" + author))
        .param("text", text)
        .param("at", Timestamp.from(at))
        .update();
  }

  private void notice(
      String key, String crew, String author, String title, String body, Instant at) {
    jdbc.sql(
            """
            INSERT INTO notices (id, crew_id, author_id, title, body, created_at, updated_at)
            VALUES (:id, :crewId, :authorId, :title, :body, :at, :at)
            ON CONFLICT DO NOTHING
            """)
        .param("id", id("notice:" + key))
        .param("crewId", id("crew:" + crew))
        .param("authorId", id("user:" + author))
        .param("title", title)
        .param("body", body)
        .param("at", Timestamp.from(at))
        .update();
  }

  private void chat(String key, String crew, long seq, String author, String text, Instant at) {
    jdbc.sql(
            """
            INSERT INTO chat_messages (id, crew_id, seq, author_id, text, created_at)
            VALUES (:id, :crewId, :seq, :authorId, :text, :at)
            ON CONFLICT DO NOTHING
            """)
        .param("id", id("chat:" + key))
        .param("crewId", id("crew:" + crew))
        .param("seq", seq)
        .param("authorId", id("user:" + author))
        .param("text", text)
        .param("at", Timestamp.from(at))
        .update();
  }

  private static String json(Map<String, Integer> byCategory) {
    try {
      return JSON.writeValueAsString(new TreeMap<>(byCategory));
    } catch (JsonProcessingException e) {
      throw new IllegalStateException(e);
    }
  }
}
