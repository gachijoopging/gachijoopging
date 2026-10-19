package site.gachijoopging.server.domain.activity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static site.gachijoopging.server.support.TestAccounts.가입한다;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jayway.jsonpath.JsonPath;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts.TestAccount;

@AutoConfigureMockMvc
class ActivityRecordApiTest extends IntegrationTest {

  // 시작 시각 2026-10-13T09:00Z 는 KST 로도 10월 13일이다
  private static final String 날짜 = "2026-10-13";

  private static final String 경로 = "[[126.93,37.52],[126.931,37.521],[126.932,37.5225]]";

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private ObjectMapper objectMapper;

  @Value("${app.media.root}")
  private String 업로드_루트;

  @Test
  void 종료하면_그날_크루_합산이_늘고_같은_종료를_다시_보내도_한_번만_더한다() throws Exception {
    TestAccount 나 = 크루원이_된다("rec-end@test.io");
    UUID 활동 = 진행_중_활동(나, true);
    mockMvc.perform(줍는다(나, 활동, 줍기(UUID.randomUUID(), "CAN", 3)));
    mockMvc.perform(일시정지(나, 활동));

    종료한다(나, 활동, 경로, "4100")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.status").value("ENDED"))
        .andExpect(jsonPath("$.data.endedAt").isNotEmpty())
        .andExpect(jsonPath("$.data.durationSec").value(2520))
        .andExpect(jsonPath("$.data.pausedSec").value(240))
        .andExpect(jsonPath("$.data.distanceM").value(3120))
        .andExpect(jsonPath("$.data.steps").value(4100))
        .andExpect(jsonPath("$.data.paused").value(false))
        .andExpect(jsonPath("$.data.pausedAt").isEmpty())
        .andExpect(jsonPath("$.data.user.id").value(나.id().toString()))
        .andExpect(jsonPath("$.data.route.length()").value(3))
        .andExpect(jsonPath("$.data.route[2][0]").value(126.932))
        .andExpect(jsonPath("$.data.route[2][1]").value(37.5225));
    종료한다(나, 활동, "[]", "9999")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.steps").value(4100))
        .andExpect(jsonPath("$.data.route.length()").value(3));

    Map<String, Object> 합산 = 크루_합산(활동);
    assertThat(합산)
        .containsEntry("activity_count", 1)
        .containsEntry("duration_sec", 2520)
        .containsEntry("distance_m", 3120)
        .containsEntry("item_count", 3);
    assertThat(카테고리(합산)).isEqualTo(Map.of("CAN", 3));
  }

  @Test
  void 점이_하나뿐이고_걸음수가_없는_짧은_활동도_저장하고_경로는_비어_있다() throws Exception {
    TestAccount 나 = 크루원이_된다("rec-short@test.io");
    UUID 활동 = 진행_중_활동(나, true);

    종료한다(나, 활동, "[[126.93,37.52]]", "null")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.steps").isEmpty())
        .andExpect(jsonPath("$.data.itemCount").value(0))
        .andExpect(jsonPath("$.data.route.length()").value(0));
    assertThat(크루_합산(활동)).containsEntry("activity_count", 1).containsEntry("item_count", 0);
  }

  @Test
  void 좌표가_둘이_아닌_점과_음수_거리는_422_이고_활동은_그대로다() throws Exception {
    TestAccount 나 = 크루원이_된다("rec-invalid@test.io");
    UUID 활동 = 진행_중_활동(나, true);

    종료한다(나, 활동, "[[126.93]]", "null").andExpect(status().isUnprocessableEntity());
    종료한다(나, 활동, "[[126.93,37.52],[181,37.52]]", "null").andExpect(status().isUnprocessableEntity());
    종료한다(나, 활동, "[[126.93,37.52],[1e400,37.52]]", "null")
        .andExpect(status().isUnprocessableEntity());
    mockMvc
        .perform(
            post("/api/v1/activities/{id}/end", 활동)
                .header(HttpHeaders.AUTHORIZATION, 나.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"endedAt\":\"2026-10-13T08:59:59Z\",\"durationSec\":10,\"pausedSec\":0,"
                        + "\"distanceM\":0,\"route\":[]}"))
        .andExpect(status().isUnprocessableEntity());
    mockMvc
        .perform(
            post("/api/v1/activities/{id}/end", 활동)
                .header(HttpHeaders.AUTHORIZATION, 나.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"endedAt\":\"2026-10-13T09:42:00Z\",\"durationSec\":10,\"pausedSec\":0,"
                        + "\"distanceM\":-1,\"route\":[]}"))
        .andExpect(status().isUnprocessableEntity());

    assertThat(상태(활동)).isEqualTo("IN_PROGRESS");
  }

  @Test
  void 남의_활동_종료는_403_이다() throws Exception {
    TestAccount 나 = 크루원이_된다("rec-end-owner@test.io");
    TestAccount 남 = 크루원이_된다("rec-end-other@test.io");
    UUID 활동 = 진행_중_활동(나, true);

    종료한다(남, 활동, 경로, "null").andExpect(status().isForbidden());
    assertThat(상태(활동)).isEqualTo("IN_PROGRESS");
  }

  @Test
  void 끝난_활동의_줍기를_고치고_지우면_크루_합산이_상세와_같아진다() throws Exception {
    TestAccount 나 = 크루원이_된다("rec-edit@test.io");
    UUID 활동 = 진행_중_활동(나, true);
    UUID 캔 = UUID.randomUUID();
    UUID 꽁초 = UUID.randomUUID();
    UUID 종이 = UUID.randomUUID();
    mockMvc.perform(
        줍는다(나, 활동, 줍기(캔, "CAN", 2) + "," + 줍기(꽁초, "CIGARETTE", 5) + "," + 줍기(종이, "PAPER", 1)));
    종료한다(나, 활동, 경로, "null").andExpect(status().isOk());

    mockMvc
        .perform(줍기를_고친다(나, 활동, 캔, "{\"quantity\":4}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.itemCount").value(10));
    mockMvc.perform(줍기를_고친다(나, 활동, 꽁초, "{\"category\":\"PLASTIC\"}")).andExpect(status().isOk());
    mockMvc
        .perform(
            delete("/api/v1/activities/{id}/items/{itemId}", 활동, 종이)
                .header(HttpHeaders.AUTHORIZATION, 나.bearer()))
        .andExpect(status().isNoContent());

    String 상세 =
        상세를_본다(나, 활동).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    Map<String, Object> 합산 = 크루_합산(활동);
    assertThat(합산).containsEntry("item_count", JsonPath.<Integer>read(상세, "$.data.itemCount"));
    assertThat(카테고리(합산))
        .isEqualTo(JsonPath.<Map<String, Integer>>read(상세, "$.data.byCategory"))
        .isEqualTo(Map.of("CAN", 4, "PLASTIC", 5));
    mockMvc.perform(줍는다(나, 활동, 줍기(UUID.randomUUID(), "CAN", 1))).andExpect(status().isConflict());
  }

  @Test
  void 활동을_지우면_그만큼_크루_합산이_줄고_다시_지워도_204_다() throws Exception {
    TestAccount 나 = 크루원이_된다("rec-delete@test.io");
    UUID 남길_활동 = 진행_중_활동(나, true);
    mockMvc.perform(줍는다(나, 남길_활동, 줍기(UUID.randomUUID(), "CAN", 2)));
    종료한다(나, 남길_활동, 경로, "null");
    UUID 지울_활동 = 진행_중_활동(나, true);
    mockMvc.perform(
        줍는다(나, 지울_활동, 줍기(UUID.randomUUID(), "CAN", 1) + "," + 줍기(UUID.randomUUID(), "VINYL", 3)));
    종료한다(나, 지울_활동, 경로, "null");

    mockMvc.perform(지운다(나, 지울_활동)).andExpect(status().isNoContent());
    mockMvc.perform(지운다(나, 지울_활동)).andExpect(status().isNoContent());

    Map<String, Object> 합산 = 크루_합산(남길_활동);
    assertThat(합산)
        .containsEntry("activity_count", 1)
        .containsEntry("duration_sec", 2520)
        .containsEntry("distance_m", 3120)
        .containsEntry("item_count", 2);
    assertThat(카테고리(합산)).isEqualTo(Map.of("CAN", 2));
    상세를_본다(나, 지울_활동).andExpect(status().isNotFound());
  }

  @Test
  void 남의_활동_삭제는_403_진행_중_활동_삭제는_409_다() throws Exception {
    TestAccount 나 = 크루원이_된다("rec-delete-owner@test.io");
    TestAccount 남 = 크루원이_된다("rec-delete-other@test.io");
    UUID 끝난_활동 = 진행_중_활동(나, true);
    종료한다(나, 끝난_활동, 경로, "null");

    mockMvc.perform(지운다(남, 끝난_활동)).andExpect(status().isForbidden());
    UUID 진행_중 = 진행_중_활동(나, true);
    mockMvc
        .perform(지운다(나, 진행_중))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONFLICT"));

    assertThat(크루_합산(끝난_활동)).containsEntry("activity_count", 1);
  }

  @Test
  void 활동을_지우면_커밋_뒤_사진_원본과_썸네일이_원래_경로에서_사라진다() throws Exception {
    TestAccount 나 = 크루원이_된다("rec-photo@test.io");
    UUID 활동 = 진행_중_활동(나, true);
    String 원본 = "2026/10/" + UUID.randomUUID() + "-a.jpg";
    String 썸네일 = 원본.replace(".jpg", "_thumb.jpg");
    사진을_넣는다(나, 활동, 원본, 썸네일);
    종료한다(나, 활동, 경로, "null");

    mockMvc.perform(지운다(나, 활동)).andExpect(status().isNoContent());

    assertThat(Path.of(업로드_루트, 원본)).doesNotExist();
    assertThat(Path.of(업로드_루트, 썸네일)).doesNotExist();
    assertThat(Path.of(업로드_루트, "deleted", 원본)).exists();
    assertThat(Path.of(업로드_루트, "deleted", 썸네일)).exists();
  }

  @Test
  void 같은_크루_남은_경로_공유를_껐으면_경로만_없이_지표와_사진을_본다() throws Exception {
    TestAccount 나 = 크루원이_된다("rec-view-owner@test.io");
    TestAccount 크루원 = 가입한다(mockMvc, "rec-view-mate@test.io");
    jdbcTemplate.update(
        "INSERT INTO crew_members (crew_id, user_id, joined_at)"
            + " SELECT crew_id, ?, now() FROM crew_members WHERE user_id = ?",
        크루원.id(),
        나.id());
    TestAccount 남의_크루원 = 크루원이_된다("rec-view-stranger@test.io");
    UUID 공유_끈_활동 = 진행_중_활동(나, false);
    사진을_넣는다(나, 공유_끈_활동, "k/" + UUID.randomUUID() + ".jpg", "k/t.jpg");
    mockMvc.perform(줍는다(나, 공유_끈_활동, 줍기(UUID.randomUUID(), "GLASS", 2)));
    종료한다(나, 공유_끈_활동, 경로, "null");

    상세를_본다(크루원, 공유_끈_활동)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.user.id").value(나.id().toString()))
        .andExpect(jsonPath("$.data.locationShared").value(false))
        .andExpect(jsonPath("$.data.route").isEmpty())
        .andExpect(jsonPath("$.data.distanceM").value(3120))
        .andExpect(jsonPath("$.data.byCategory.GLASS").value(2))
        .andExpect(jsonPath("$.data.items.length()").value(1))
        .andExpect(jsonPath("$.data.photos.length()").value(1))
        .andExpect(
            jsonPath("$.data.photos[0].url")
                .value(org.hamcrest.Matchers.startsWith(MEDIA_BASE_URL)));
    상세를_본다(나, 공유_끈_활동).andExpect(jsonPath("$.data.route.length()").value(3));
    상세를_본다(남의_크루원, 공유_끈_활동).andExpect(status().isForbidden());

    UUID 공유한_활동 = 진행_중_활동(나, true);
    종료한다(나, 공유한_활동, 경로, "null");
    상세를_본다(크루원, 공유한_활동).andExpect(jsonPath("$.data.route.length()").value(3));
    mockMvc.perform(지운다(크루원, 공유한_활동)).andExpect(status().isForbidden());
  }

  @Test
  void 크루를_나가도_내_기록_목록과_상세는_200_이다() throws Exception {
    TestAccount 나 = 크루원이_된다("rec-left@test.io");
    UUID 활동 = 진행_중_활동(나, true);
    종료한다(나, 활동, 경로, "null");
    mockMvc
        .perform(post("/api/v1/crew/leave").header(HttpHeaders.AUTHORIZATION, 나.bearer()))
        .andExpect(status().isNoContent());

    mockMvc
        .perform(목록(나, null, 20))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items.length()").value(1))
        .andExpect(jsonPath("$.data.items[0].id").value(활동.toString()));
    상세를_본다(나, 활동).andExpect(status().isOk()).andExpect(jsonPath("$.data.route.length()").value(3));
  }

  @Test
  void 내_기록_목록은_시작_최신순_커서_페이지이고_진행_중과_지운_활동은_빠진다() throws Exception {
    TestAccount 나 = 크루원이_된다("rec-list@test.io");
    TestAccount 남 = 크루원이_된다("rec-list-other@test.io");
    UUID 첫째 = 끝난_활동(나, "2026-10-01T09:00:00Z");
    UUID 둘째 = 끝난_활동(나, "2026-10-02T09:00:00Z");
    UUID 셋째 = 끝난_활동(나, "2026-10-03T09:00:00Z");
    UUID 지운_활동 = 끝난_활동(나, "2026-10-04T09:00:00Z");
    mockMvc.perform(지운다(나, 지운_활동));
    사진을_넣는다(나, 셋째, "k/" + UUID.randomUUID() + ".jpg", "k/셋째_thumb.jpg");
    끝난_활동(남, "2026-10-05T09:00:00Z");
    진행_중_활동(나, true);

    String 첫_장 =
        mockMvc
            .perform(목록(나, null, 2))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.items.length()").value(2))
            .andExpect(jsonPath("$.data.items[0].id").value(셋째.toString()))
            .andExpect(jsonPath("$.data.items[0].distanceM").value(3120))
            .andExpect(
                jsonPath("$.data.items[0].thumbUrl")
                    .value(org.hamcrest.Matchers.containsString("셋째_thumb")))
            .andExpect(jsonPath("$.data.items[1].id").value(둘째.toString()))
            .andExpect(jsonPath("$.data.items[1].thumbUrl").isEmpty())
            .andReturn()
            .getResponse()
            .getContentAsString();
    String 커서 = JsonPath.read(첫_장, "$.data.nextCursor");

    mockMvc
        .perform(목록(나, 커서, 2))
        .andExpect(jsonPath("$.data.items.length()").value(1))
        .andExpect(jsonPath("$.data.items[0].id").value(첫째.toString()))
        .andExpect(jsonPath("$.data.nextCursor").isEmpty());
  }

  private TestAccount 크루원이_된다(String 이메일) throws Exception {
    TestAccount 계정 = 가입한다(mockMvc, 이메일);
    mockMvc
        .perform(
            post("/api/v1/crews")
                .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"name\":\"크루%s\",\"region\":\"SEOUL\",\"joinPolicy\":\"OPEN\"}"
                        .formatted(UUID.randomUUID().toString().substring(0, 8))))
        .andExpect(status().isCreated());
    return 계정;
  }

  private UUID 진행_중_활동(TestAccount 계정, boolean 위치_공유) throws Exception {
    return 시작한다(계정, "2026-10-13T09:00:00Z", 위치_공유);
  }

  private UUID 끝난_활동(TestAccount 계정, String 시작) throws Exception {
    UUID 활동 = 시작한다(계정, 시작, true);
    종료한다(계정, 활동, 경로, "null").andExpect(status().isOk());
    return 활동;
  }

  private UUID 시작한다(TestAccount 계정, String 시작, boolean 위치_공유) throws Exception {
    UUID 활동 = UUID.randomUUID();
    mockMvc
        .perform(
            post("/api/v1/activities")
                .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"id\":\"%s\",\"startedAt\":\"%s\",\"locationShared\":%s}"
                        .formatted(활동, 시작, 위치_공유)))
        .andExpect(status().isCreated());
    return 활동;
  }

  private ResultActions 종료한다(TestAccount 계정, UUID 활동, String 경로, String 걸음수) throws Exception {
    return mockMvc.perform(
        post("/api/v1/activities/{id}/end", 활동)
            .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                ("{\"endedAt\":\"2026-10-13T09:46:00Z\",\"durationSec\":2520,\"pausedSec\":240,"
                        + "\"distanceM\":3120,\"steps\":%s,\"route\":%s}")
                    .formatted(걸음수, 경로)));
  }

  private ResultActions 상세를_본다(TestAccount 계정, UUID 활동) throws Exception {
    return mockMvc.perform(
        get("/api/v1/activities/{id}", 활동).header(HttpHeaders.AUTHORIZATION, 계정.bearer()));
  }

  private static MockHttpServletRequestBuilder 지운다(TestAccount 계정, UUID 활동) {
    return delete("/api/v1/activities/{id}", 활동).header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private static MockHttpServletRequestBuilder 목록(TestAccount 계정, String 커서, int 수) {
    MockHttpServletRequestBuilder 요청 =
        get("/api/v1/users/me/activities")
            .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
            .param("limit", String.valueOf(수));
    return 커서 == null ? 요청 : 요청.param("cursor", 커서);
  }

  private static String 줍기(UUID id, String 카테고리, int 수량) {
    return "{\"id\":\"%s\",\"category\":\"%s\",\"quantity\":%d}".formatted(id, 카테고리, 수량);
  }

  private static MockHttpServletRequestBuilder 줍는다(TestAccount 계정, UUID 활동, String 줍기들) {
    return post("/api/v1/activities/{id}/items", 활동)
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"photoId\":null,\"items\":[%s]}".formatted(줍기들));
  }

  private static MockHttpServletRequestBuilder 줍기를_고친다(
      TestAccount 계정, UUID 활동, UUID 줍기, String 본문) {
    return patch("/api/v1/activities/{id}/items/{itemId}", 활동, 줍기)
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content(본문);
  }

  private static MockHttpServletRequestBuilder 일시정지(TestAccount 계정, UUID 활동) {
    return post("/api/v1/activities/{id}/pause", 활동).header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private void 사진을_넣는다(TestAccount 주인, UUID 활동, String 원본, String 썸네일) throws Exception {
    UUID 미디어 = UUID.randomUUID();
    for (String 키 : new String[] {원본, 썸네일}) {
      Path 파일 = Path.of(업로드_루트, 키);
      Files.createDirectories(파일.getParent());
      Files.write(파일, new byte[] {1});
    }
    jdbcTemplate.update(
        "INSERT INTO media (id, owner_id, purpose, object_key, thumb_key) VALUES (?, ?, 'ACTIVITY', ?, ?)",
        미디어,
        주인.id(),
        원본,
        썸네일);
    jdbcTemplate.update(
        "INSERT INTO activity_photos (id, activity_id, media_id, taken_at, inference_status,"
            + " order_index) VALUES (?, ?, ?, now(), 'OK', 0)",
        UUID.randomUUID(),
        활동,
        미디어);
  }

  private String 상태(UUID 활동) {
    return jdbcTemplate.queryForObject(
        "SELECT status FROM activities WHERE id = ?", String.class, 활동);
  }

  private Map<String, Object> 크루_합산(UUID 활동) {
    return jdbcTemplate.queryForMap(
        "SELECT s.activity_count, s.duration_sec, s.distance_m, s.item_count,"
            + " CAST(s.by_category AS text) AS by_category"
            + " FROM crew_daily_stats s JOIN activities a ON a.crew_id = s.crew_id"
            + " WHERE a.id = ? AND s.date = CAST(? AS date)",
        활동,
        날짜);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Integer> 카테고리(Map<String, Object> 합산) throws Exception {
    return objectMapper.readValue((String) 합산.get("by_category"), Map.class);
  }
}
