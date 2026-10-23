package site.gachijoopging.server.domain.stats;

import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static site.gachijoopging.server.support.TestAccounts.가입한다;

import com.jayway.jsonpath.JsonPath;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts.TestAccount;

@AutoConfigureMockMvc
class StatsApiTest extends IntegrationTest {

  // KST 2026-10-14(수) 12:00. 이번 주는 10-12(월)부터, 이번 달은 10-01 부터다
  private static final Instant 지금 = Instant.parse("2026-10-14T03:00:00Z");

  @TestConfiguration
  static class 시계_고정 {
    @Bean
    @Primary
    Clock fixedClock() {
      return Clock.fixed(지금, ZoneOffset.UTC);
    }
  }

  @Autowired private MockMvc mockMvc;

  @Test
  void 두_사람이_활동을_끝내면_크루_기록_합계가_맞고_같은_수량은_공동_순위다() throws Exception {
    TestAccount 크루장 = 계정();
    String 크루 = 공개_크루를_만든다(크루장);
    TestAccount 크루원 = 계정();
    들어간다(크루원, 크루);
    끝낸다(크루장, "2026-10-13T01:00:00Z", Map.of("CAN", 2, "PLASTIC", 1));
    끝낸다(크루원, "2026-10-13T02:00:00Z", Map.of("CAN", 3));

    조회(크루장, "/crew/stats", "range", "WEEK")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.range").value("WEEK"))
        .andExpect(jsonPath("$.data.totals.items").value(6))
        .andExpect(jsonPath("$.data.totals.activities").value(2))
        .andExpect(jsonPath("$.data.totals.distanceM").value(2000))
        .andExpect(jsonPath("$.data.totals.durationSec").value(1200))
        .andExpect(jsonPath("$.data.byCategory.CAN").value(5))
        .andExpect(jsonPath("$.data.byCategory.PLASTIC").value(1))
        .andExpect(jsonPath("$.data.byCategory.GLASS").doesNotExist())
        .andExpect(jsonPath("$.data.ranking.length()").value(2))
        .andExpect(jsonPath("$.data.ranking[0].rank").value(1))
        .andExpect(jsonPath("$.data.ranking[1].rank").value(1))
        .andExpect(jsonPath("$.data.ranking[0].items").value(3))
        .andExpect(jsonPath("$.data.ranking[0].distanceM").value(1000));
  }

  @Test
  void 순위는_수량_내림차순이고_공동_순위_다음은_그_수만큼_건너뛴다() throws Exception {
    TestAccount 크루장 = 계정();
    String 크루 = 공개_크루를_만든다(크루장);
    TestAccount 둘째 = 계정();
    TestAccount 셋째 = 계정();
    들어간다(둘째, 크루);
    들어간다(셋째, 크루);
    끝낸다(크루장, "2026-10-13T01:00:00Z", Map.of("CAN", 1));
    끝낸다(둘째, "2026-10-13T02:00:00Z", Map.of("CAN", 4));
    끝낸다(셋째, "2026-10-13T03:00:00Z", Map.of("CAN", 4));

    조회(크루장, "/crew/stats", "range", "MONTH")
        .andExpect(jsonPath("$.data.ranking[*].rank", contains(1, 1, 3)))
        .andExpect(jsonPath("$.data.ranking[2].user.id").value(크루장.id().toString()));
  }

  @Test
  void 기간_안에_활동이_없는_크루원도_0개로_함께_맨_뒤에_선다() throws Exception {
    TestAccount 크루장 = 계정();
    String 크루 = 공개_크루를_만든다(크루장);
    TestAccount 둘째 = 계정();
    TestAccount 셋째 = 계정();
    들어간다(둘째, 크루);
    들어간다(셋째, 크루);
    끝낸다(크루장, "2026-10-13T01:00:00Z", Map.of("CAN", 2));

    조회(크루장, "/crew/stats", "range", "WEEK")
        .andExpect(jsonPath("$.data.ranking[*].rank", contains(1, 2, 2)))
        .andExpect(jsonPath("$.data.ranking[0].user.id").value(크루장.id().toString()))
        .andExpect(jsonPath("$.data.ranking[*].items", contains(2, 0, 0)))
        .andExpect(jsonPath("$.data.ranking[*].distanceM", contains(1000, 0, 0)));
  }

  @Test
  void WEEK_는_KST_월요일_00시부터_세고_MONTH_는_이번_달_1일부터다() throws Exception {
    TestAccount 나 = 계정();
    공개_크루를_만든다(나);
    끝낸다(나, "2026-10-11T14:59:59Z", Map.of("CAN", 1)); // KST 10-11(일) 23:59:59
    끝낸다(나, "2026-10-11T15:00:00Z", Map.of("CAN", 2)); // KST 10-12(월) 00:00
    끝낸다(나, "2026-09-30T15:00:00Z", Map.of("CAN", 4)); // KST 10-01 00:00
    끝낸다(나, "2026-09-30T14:59:59Z", Map.of("CAN", 8)); // KST 09-30 23:59:59

    조회(나, "/crew/stats", "range", "WEEK")
        .andExpect(jsonPath("$.data.totals.items").value(2))
        .andExpect(
            jsonPath("$.data.series[*].date", contains("2026-10-12", "2026-10-13", "2026-10-14")))
        .andExpect(jsonPath("$.data.series[*].items", contains(2, 0, 0)))
        .andExpect(jsonPath("$.data.ranking[0].items").value(2));
    조회(나, "/crew/stats")
        .andExpect(jsonPath("$.data.range").value("MONTH"))
        .andExpect(jsonPath("$.data.totals.items").value(7))
        .andExpect(jsonPath("$.data.series.length()").value(14))
        .andExpect(jsonPath("$.data.series[0].date").value("2026-10-01"))
        .andExpect(jsonPath("$.data.series[0].items").value(4));
  }

  @Test
  void ALL_은_전체_합계에_월별_추이다() throws Exception {
    TestAccount 나 = 계정();
    공개_크루를_만든다(나);
    끝낸다(나, "2026-08-20T01:00:00Z", Map.of("CAN", 3));
    끝낸다(나, "2026-10-02T01:00:00Z", Map.of("CAN", 5));
    끝낸다(나, "2026-10-03T01:00:00Z", Map.of("GLASS", 1));

    조회(나, "/crew/stats", "range", "ALL")
        .andExpect(jsonPath("$.data.totals.items").value(9))
        .andExpect(jsonPath("$.data.totals.activities").value(3))
        .andExpect(
            jsonPath("$.data.series[*].date", contains("2026-08-01", "2026-09-01", "2026-10-01")))
        .andExpect(jsonPath("$.data.series[*].items", contains(3, 0, 6)));
  }

  @Test
  void 잘못된_기간과_달은_422_다() throws Exception {
    TestAccount 나 = 계정();
    공개_크루를_만든다(나);

    조회(나, "/crew/stats", "range", "YEAR").andExpect(status().isUnprocessableEntity());
    조회(나, "/crew/calendar", "month", "2026-13").andExpect(status().isUnprocessableEntity());
    조회(나, "/crew/calendar", "month", "2026-1").andExpect(status().isUnprocessableEntity());
    조회(나, "/crew/calendar").andExpect(status().isUnprocessableEntity());
  }

  @Test
  void 달력은_KST_날짜별_활동_횟수이고_하루의_활동은_시작_순이다() throws Exception {
    TestAccount 크루장 = 계정();
    String 크루 = 공개_크루를_만든다(크루장);
    TestAccount 크루원 = 계정();
    들어간다(크루원, 크루);
    UUID 늦은 = 끝낸다(크루장, "2026-10-05T05:00:00Z", Map.of("CAN", 2));
    UUID 이른 = 끝낸다(크루원, "2026-10-05T01:00:00Z", Map.of("CAN", 3));
    끝낸다(크루원, "2026-10-01T14:59:59Z", Map.of("CAN", 1)); // KST 10-01 23:59:59
    끝낸다(크루원, "2026-09-30T14:59:59Z", Map.of("CAN", 1)); // KST 09-30 — 9월

    조회(크루장, "/crew/calendar", "month", "2026-10")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.days[*].date", contains("2026-10-01", "2026-10-05")))
        .andExpect(jsonPath("$.data.days[1].activityCount").value(2))
        .andExpect(jsonPath("$.data.days[1].items").value(5))
        .andExpect(jsonPath("$.data.days[1].activities[0].activityId").value(이른.toString()))
        .andExpect(jsonPath("$.data.days[1].activities[0].user.id").value(크루원.id().toString()))
        .andExpect(jsonPath("$.data.days[1].activities[0].items").value(3))
        .andExpect(jsonPath("$.data.days[1].activities[1].activityId").value(늦은.toString()))
        .andExpect(jsonPath("$.data.days[1].activities[1].distanceM").value(1000));
  }

  @Test
  void 홈_캐릭터는_최근_14일_수량을_목표와_비교한_경계값에서_단계가_바뀐다() throws Exception {
    TestAccount 나 = 계정();
    공개_크루를_만든다(나);
    mockMvc
        .perform(
            patch("/api/v1/crew")
                .header(HttpHeaders.AUTHORIZATION, 나.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"goalCount\":100}"))
        .andExpect(status().isOk());
    끝낸다(나, "2026-09-30T01:00:00Z", Map.of("CAN", 500)); // 14일 창 밖

    끝낸다(나, "2026-10-01T01:00:00Z", Map.of("CAN", 19)); // KST 10-01 = 14일 창의 첫날
    단계(나, 19, 1);
    끝낸다(나, "2026-10-14T01:00:00Z", Map.of("CAN", 1));
    단계(나, 20, 2);
    끝낸다(나, "2026-10-14T01:30:00Z", Map.of("CAN", 79));
    단계(나, 99, 4);
    끝낸다(나, "2026-10-14T02:00:00Z", Map.of("CAN", 1));
    단계(나, 100, 5);
  }

  @Test
  void 홈은_최근_7일_크루와_내_수량을_6일_전부터_오늘까지_싣는다() throws Exception {
    TestAccount 나 = 계정();
    String 크루 = 공개_크루를_만든다(나);
    TestAccount 크루원 = 계정();
    들어간다(크루원, 크루);
    끝낸다(나, "2026-10-07T14:59:59Z", Map.of("CAN", 100)); // KST 10-07 — 7일 창 밖
    끝낸다(나, "2026-10-07T15:00:00Z", Map.of("CAN", 2, "PLASTIC", 1)); // KST 10-08
    끝낸다(크루원, "2026-10-14T01:00:00Z", Map.of("GLASS", 4));

    조회(나, "/crew/home")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.crew.id").value(크루))
        .andExpect(jsonPath("$.data.last7d.crewItems").value(7))
        .andExpect(jsonPath("$.data.last7d.myItems").value(3))
        .andExpect(jsonPath("$.data.last7d.myByCategory.CAN").value(2))
        .andExpect(jsonPath("$.data.last7d.myByCategory.PLASTIC").value(1))
        .andExpect(jsonPath("$.data.last7d.myByCategory.GLASS").doesNotExist())
        .andExpect(jsonPath("$.data.last7d.daily", contains(3, 0, 0, 0, 0, 0, 4)))
        .andExpect(jsonPath("$.data.character.windowDays").value(14))
        .andExpect(jsonPath("$.data.character.items").value(107))
        .andExpect(jsonPath("$.data.character.goalCount").value(200))
        .andExpect(jsonPath("$.data.live.count").value(0))
        .andExpect(jsonPath("$.data.unreadNotifications").value(0));
  }

  @Test
  void 끝난_활동의_줍기를_고치거나_활동을_지우면_홈과_크루_기록이_따라_바뀐다() throws Exception {
    TestAccount 크루장 = 계정();
    String 크루 = 공개_크루를_만든다(크루장);
    TestAccount 크루원 = 계정();
    들어간다(크루원, 크루);
    UUID 내_활동 = 끝낸다(크루장, "2026-10-13T01:00:00Z", Map.of("CAN", 3));
    UUID 남의_활동 = 끝낸다(크루원, "2026-10-13T02:00:00Z", Map.of("CAN", 2));

    String 줍기 =
        JsonPath.read(
            mockMvc
                .perform(
                    get("/api/v1/activities/{id}", 내_활동)
                        .header(HttpHeaders.AUTHORIZATION, 크루장.bearer()))
                .andReturn()
                .getResponse()
                .getContentAsString(),
            "$.data.items[0].id");
    mockMvc
        .perform(
            patch("/api/v1/activities/{id}/items/{itemId}", 내_활동, 줍기)
                .header(HttpHeaders.AUTHORIZATION, 크루장.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"quantity\":1}"))
        .andExpect(status().isOk());

    조회(크루장, "/crew/stats", "range", "WEEK")
        .andExpect(jsonPath("$.data.totals.items").value(3))
        .andExpect(jsonPath("$.data.ranking[0].user.id").value(크루원.id().toString()))
        .andExpect(jsonPath("$.data.ranking[*].rank", contains(1, 2)));
    조회(크루장, "/crew/home")
        .andExpect(jsonPath("$.data.last7d.crewItems").value(3))
        .andExpect(jsonPath("$.data.last7d.myItems").value(1));

    mockMvc
        .perform(
            delete("/api/v1/activities/{id}", 남의_활동)
                .header(HttpHeaders.AUTHORIZATION, 크루원.bearer()))
        .andExpect(status().isNoContent());

    조회(크루장, "/crew/stats", "range", "WEEK")
        .andExpect(jsonPath("$.data.totals.items").value(1))
        .andExpect(jsonPath("$.data.totals.activities").value(1))
        .andExpect(jsonPath("$.data.ranking.length()").value(2))
        .andExpect(jsonPath("$.data.ranking[0].user.id").value(크루장.id().toString()))
        .andExpect(jsonPath("$.data.ranking[1].items").value(0));
    조회(크루장, "/crew/home").andExpect(jsonPath("$.data.last7d.crewItems").value(1));
  }

  @Test
  void 크루를_나간_사람도_내_통계는_200_이고_이전_크루_활동을_포함한다() throws Exception {
    TestAccount 크루장 = 계정();
    String 크루 = 공개_크루를_만든다(크루장);
    TestAccount 나 = 계정();
    들어간다(나, 크루);
    끝낸다(나, "2026-10-13T01:00:00Z", Map.of("CAN", 3));
    끝낸다(나, "2026-04-01T01:00:00Z", Map.of("CAN", 1)); // 6개월보다 전 — 누적에만
    mockMvc
        .perform(post("/api/v1/crew/leave").header(HttpHeaders.AUTHORIZATION, 나.bearer()))
        .andExpect(status().is2xxSuccessful());

    조회(나, "/users/me/stats")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.totalItems").value(4))
        .andExpect(jsonPath("$.data.totalDistanceM").value(2000))
        .andExpect(jsonPath("$.data.totalActivities").value(2))
        .andExpect(jsonPath("$.data.activeDays", contains("2026-10-13")));
    조회(나, "/crew/home").andExpect(status().isForbidden());
  }

  @Test
  void 크루원의_활동_목록은_지금_크루에서_끝낸_것만_최신순_커서_페이지이고_크루원이_아니면_404_다() throws Exception {
    TestAccount 크루장 = 계정();
    String 크루 = 공개_크루를_만든다(크루장);
    TestAccount 크루원 = 계정();
    들어간다(크루원, 크루);
    UUID 먼저 = 끝낸다(크루원, "2026-10-10T01:00:00Z", Map.of("CAN", 1));
    UUID 나중 = 끝낸다(크루원, "2026-10-12T01:00:00Z", Map.of("CAN", 2));

    String 첫_페이지 =
        조회(크루장, "/crew/members/" + 크루원.id() + "/activities", "limit", "1")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.items[0].id").value(나중.toString()))
            .andExpect(jsonPath("$.data.items[0].itemCount").value(2))
            .andReturn()
            .getResponse()
            .getContentAsString();
    String 커서 = JsonPath.read(첫_페이지, "$.data.nextCursor");
    조회(크루장, "/crew/members/" + 크루원.id() + "/activities", "limit", "1", "cursor", 커서)
        .andExpect(jsonPath("$.data.items[0].id").value(먼저.toString()))
        .andExpect(jsonPath("$.data.nextCursor").isEmpty());

    조회(크루장, "/crew/members/" + 계정().id() + "/activities").andExpect(status().isNotFound());
    조회(크루장, "/crew/members/" + 크루원.id() + "/activities", "limit", "51")
        .andExpect(status().isUnprocessableEntity());
  }

  private void 단계(TestAccount 계정, int 수량, int 단계) throws Exception {
    조회(계정, "/crew/home")
        .andExpect(jsonPath("$.data.character.items").value(수량))
        .andExpect(jsonPath("$.data.character.goalCount").value(100))
        .andExpect(jsonPath("$.data.character.stage").value(단계));
  }

  private TestAccount 계정() throws Exception {
    return 가입한다(mockMvc, "stats-" + UUID.randomUUID().toString().substring(0, 8) + "@test.io");
  }

  private String 공개_크루를_만든다(TestAccount 계정) throws Exception {
    return JsonPath.read(
        mockMvc
            .perform(
                post("/api/v1/crews")
                    .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        "{\"name\":\"크루%s\",\"region\":\"SEOUL\",\"joinPolicy\":\"OPEN\"}"
                            .formatted(UUID.randomUUID().toString().substring(0, 8))))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString(),
        "$.data.id");
  }

  private void 들어간다(TestAccount 계정, String 크루) throws Exception {
    mockMvc
        .perform(
            post("/api/v1/crews/join-requests")
                .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"crewId\":\"%s\"}".formatted(크루)))
        .andExpect(status().is2xxSuccessful());
  }

  // 10분 활동, 거리 1000m
  private UUID 끝낸다(TestAccount 계정, String 시작, Map<String, Integer> 수량) throws Exception {
    UUID 활동 = UUID.randomUUID();
    mockMvc
        .perform(
            post("/api/v1/activities")
                .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"id\":\"%s\",\"startedAt\":\"%s\",\"locationShared\":true}"
                        .formatted(활동, 시작)))
        .andExpect(status().isCreated());
    String 줍기들 =
        수량.entrySet().stream()
            .map(
                e ->
                    "{\"id\":\"%s\",\"category\":\"%s\",\"quantity\":%d}"
                        .formatted(UUID.randomUUID(), e.getKey(), e.getValue()))
            .collect(Collectors.joining(","));
    mockMvc
        .perform(
            post("/api/v1/activities/{id}/items", 활동)
                .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"photoId\":null,\"items\":[%s]}".formatted(줍기들)))
        .andExpect(status().isOk());
    mockMvc
        .perform(
            post("/api/v1/activities/{id}/end", 활동)
                .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"endedAt\":\"%s\",\"durationSec\":600,\"pausedSec\":0,\"distanceM\":1000,\"route\":[]}"
                        .formatted(Instant.parse(시작).plus(Duration.ofMinutes(10)))))
        .andExpect(status().isOk());
    return 활동;
  }

  private ResultActions 조회(TestAccount 계정, String 경로, String... 파라미터) throws Exception {
    var 요청 = get("/api/v1" + 경로).header(HttpHeaders.AUTHORIZATION, 계정.bearer());
    for (int i = 0; i < 파라미터.length; i += 2) {
      요청.param(파라미터[i], 파라미터[i + 1]);
    }
    return mockMvc.perform(요청);
  }
}
