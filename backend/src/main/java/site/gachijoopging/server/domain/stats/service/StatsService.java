package site.gachijoopging.server.domain.stats.service;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.activity.dto.ActivityCardResponse;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;
import site.gachijoopging.server.domain.live.dto.LiveMemberResponse;
import site.gachijoopging.server.domain.live.service.LiveService;
import site.gachijoopging.server.domain.media.service.MediaSignedUrl;
import site.gachijoopging.server.domain.stats.dto.CalendarResponse;
import site.gachijoopging.server.domain.stats.dto.CalendarResponse.CalendarActivity;
import site.gachijoopging.server.domain.stats.dto.CalendarResponse.CalendarDay;
import site.gachijoopging.server.domain.stats.dto.CrewStatsResponse;
import site.gachijoopging.server.domain.stats.dto.HomeResponse;
import site.gachijoopging.server.domain.stats.dto.MemberStatsResponse;
import site.gachijoopging.server.domain.stats.dto.StatsDelta;
import site.gachijoopging.server.domain.stats.dto.StatsRange;
import site.gachijoopging.server.domain.stats.repository.CrewDailyStatsRepository;
import site.gachijoopging.server.domain.stats.repository.StatsQueryRepository;
import site.gachijoopging.server.domain.stats.repository.StatsQueryRepository.CardCursor;
import site.gachijoopging.server.domain.stats.repository.StatsQueryRepository.CardRow;
import site.gachijoopging.server.domain.stats.repository.StatsQueryRepository.Totals;
import site.gachijoopging.server.domain.stats.repository.StatsQueryRepository.UserRow;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.response.CursorPage;
import site.gachijoopging.server.global.response.Cursors;

@Service
@RequiredArgsConstructor
public class StatsService {

  private static final ZoneId KST = ZoneId.of("Asia/Seoul");

  private static final String WITHDRAWN_NICKNAME = "탈퇴한 크루원";

  // 홈의 두 창은 굴러가는 창이라 절벽처럼 리셋되지 않는다 (feature-scope §홈)
  private static final int LAST_DAYS = 7;
  private static final int CHARACTER_DAYS = 14;

  private static final int LIVE_FACES = 5;

  private final CrewDailyStatsRepository crewDailyStatsRepository;
  private final StatsQueryRepository queryRepository;
  private final LiveService liveService;
  private final MediaSignedUrl signedUrl;
  private final Clock clock;

  // 활동을 바꾸는 트랜잭션 안에서만 부른다 — 따로 커밋되면 합산이 활동과 어긋난다.
  // 활동은 시작한 날에 센다 (ERD crew_daily_stats: 날짜는 KST)
  @Transactional(propagation = Propagation.MANDATORY)
  public void add(UUID crewId, Instant startedAt, StatsDelta delta) {
    crewDailyStatsRepository.add(crewId, LocalDate.ofInstant(startedAt, KST), delta);
  }

  @Transactional(readOnly = true)
  public HomeResponse home(UUID me, UUID crewId) {
    LocalDate today = today();
    StatsQueryRepository.CrewRow crew = queryRepository.crew(crewId);
    List<Long> window =
        queryRepository.daily(crewId, today.minusDays(CHARACTER_DAYS - 1), today).stream()
            .map(StatsQueryRepository.DayRow::items)
            .toList();
    List<Long> daily = window.subList(window.size() - LAST_DAYS, window.size());
    Map<String, Integer> mine =
        queryRepository.myByCategory(crewId, me, today.minusDays(LAST_DAYS - 1));
    long characterItems = sum(window);
    List<LiveMemberResponse> live = liveService.crewLive(me, crewId);
    return new HomeResponse(
        new HomeResponse.HomeCrew(crew.id().toString(), crew.name()),
        new HomeResponse.Last7d(
            sum(daily), mine.values().stream().mapToLong(Integer::longValue).sum(), mine, daily),
        new HomeResponse.CrewCharacter(
            CHARACTER_DAYS,
            characterItems,
            crew.goalCount(),
            stage(characterItems, crew.goalCount())),
        new HomeResponse.LiveSummary(
            live.size(), live.stream().limit(LIVE_FACES).map(LiveMemberResponse::user).toList()),
        queryRepository.unreadNotifications(me));
  }

  // feature-scope §홈: 목표 대비 0~19% · 20~49% · 50~79% · 80~99% · 100% 이상
  static int stage(long items, int goalCount) {
    long percent = items * 100 / goalCount;
    if (percent >= 100) {
      return 5;
    }
    if (percent >= 80) {
      return 4;
    }
    if (percent >= 50) {
      return 3;
    }
    return percent >= 20 ? 2 : 1;
  }

  @Transactional(readOnly = true)
  public CrewStatsResponse crewStats(UUID crewId, StatsRange range) {
    LocalDate today = today();
    LocalDate from =
        switch (range) {
          case WEEK -> today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
          case MONTH -> today.withDayOfMonth(1);
          case ALL -> null;
        };
    List<StatsQueryRepository.DayRow> series =
        from == null
            ? queryRepository.monthly(crewId, queryRepository.crew(crewId).firstDay(), today)
            : queryRepository.daily(crewId, from, today);
    Totals totals = queryRepository.crewTotals(crewId, from);
    return new CrewStatsResponse(
        range.name(),
        new CrewStatsResponse.StatsTotals(
            totals.items(), totals.distanceM(), totals.durationSec(), totals.activities()),
        queryRepository.crewByCategory(crewId, from),
        series.stream()
            .map(day -> new CrewStatsResponse.SeriesPoint(day.date(), day.items()))
            .toList(),
        queryRepository.ranking(crewId, from).stream()
            .map(
                row ->
                    new CrewStatsResponse.RankEntry(
                        row.rank(), brief(row.user()), row.items(), row.distanceM()))
            .toList());
  }

  @Transactional(readOnly = true)
  public CalendarResponse calendar(UUID crewId, String yearMonth) {
    YearMonth month = parse(yearMonth);
    LocalDate from = month.atDay(1);
    LocalDate to = month.atEndOfMonth();
    Map<LocalDate, List<CalendarActivity>> byDay = new LinkedHashMap<>();
    queryRepository
        .calendarActivities(crewId, from, to)
        .forEach(
            row ->
                byDay
                    .computeIfAbsent(row.date(), d -> new ArrayList<>())
                    .add(
                        new CalendarActivity(
                            row.id().toString(),
                            row.startedAt(),
                            brief(row.user()),
                            row.items(),
                            row.distanceM())));
    return new CalendarResponse(
        queryRepository.activeDays(crewId, from, to).stream()
            .map(
                day ->
                    new CalendarDay(
                        day.date(),
                        day.items(),
                        day.activityCount(),
                        byDay.getOrDefault(day.date(), List.of())))
            .toList());
  }

  @Transactional(readOnly = true)
  public MemberStatsResponse myStats(UUID me) {
    Totals totals = queryRepository.userTotals(me);
    return new MemberStatsResponse(
        totals.items(),
        totals.distanceM(),
        totals.activities(),
        queryRepository.userActiveDays(me, today().minusMonths(6)));
  }

  // 지금 크루원이 아니면 GET /crew/members/{userId} 와 같이 404 다
  @Transactional(readOnly = true)
  public CursorPage<ActivityCardResponse> memberActivities(
      UUID crewId, UUID userId, String cursor, int limit) {
    if (!queryRepository.isMember(crewId, userId)) {
      throw new BusinessException(ErrorCode.NOT_FOUND, "크루원이 아니다");
    }
    Optional<CardCursor> before =
        Optional.ofNullable(cursor)
            .map(Cursors::decode)
            .map(c -> new CardCursor(c.createdAt(), c.id()));
    List<CardRow> rows = queryRepository.memberCards(crewId, userId, before, limit + 1);
    List<CardRow> page = rows.subList(0, Math.min(limit, rows.size()));
    String next =
        rows.size() > limit
            ? Cursors.encode(page.getLast().startedAt(), page.getLast().id())
            : null;
    return new CursorPage<>(page.stream().map(this::card).toList(), next);
  }

  // 형식은 맞아도 13월 같은 값은 파싱에서 걸린다
  private static YearMonth parse(String yearMonth) {
    try {
      return YearMonth.parse(yearMonth);
    } catch (DateTimeParseException e) {
      throw new BusinessException(ErrorCode.VALIDATION, "month 가 올바르지 않다");
    }
  }

  private LocalDate today() {
    return LocalDate.now(clock.withZone(KST));
  }

  private static long sum(List<Long> values) {
    return values.stream().mapToLong(Long::longValue).sum();
  }

  private UserBriefResponse brief(UserRow user) {
    if ("DELETED".equals(user.status())) {
      return new UserBriefResponse(user.id().toString(), WITHDRAWN_NICKNAME, null, true);
    }
    return new UserBriefResponse(
        user.id().toString(),
        Objects.requireNonNullElse(user.nickname(), ""),
        user.photoKey() == null ? null : signedUrl.of(user.photoKey()),
        false);
  }

  private ActivityCardResponse card(CardRow row) {
    return new ActivityCardResponse(
        row.id(),
        row.startedAt(),
        row.durationSec(),
        row.distanceM(),
        row.itemCount(),
        row.thumbKey() == null ? null : signedUrl.of(row.thumbKey()));
  }
}
