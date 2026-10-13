package site.gachijoopging.server.domain.activity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static site.gachijoopging.server.support.TestAccounts.가입_본문;
import static site.gachijoopging.server.support.TestAccounts.가입한다;
import static site.gachijoopging.server.support.TestAccounts.내_id;

import com.jayway.jsonpath.JsonPath;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
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
class ActivityApiTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private DataSource dataSource;

  @Test
  void 시작하면_201_이고_같은_id_재전송은_200_다른_id_는_409_다() throws Exception {
    TestAccount 나 = 크루원이_된다("act-start@test.io");
    UUID 활동 = UUID.randomUUID();

    시작한다(나, 활동, true)
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.id").value(활동.toString()))
        .andExpect(jsonPath("$.data.status").value("IN_PROGRESS"))
        .andExpect(jsonPath("$.data.paused").value(false))
        .andExpect(jsonPath("$.data.pausedAt").isEmpty())
        .andExpect(jsonPath("$.data.steps").isEmpty())
        .andExpect(jsonPath("$.data.locationShared").value(true))
        .andExpect(jsonPath("$.data.itemCount").value(0));
    시작한다(나, 활동, true).andExpect(status().isOk());
    시작한다(나, UUID.randomUUID(), true)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONFLICT"));

    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT crew_id = (SELECT crew_id FROM crew_members WHERE user_id = ?)"
                    + " FROM activities WHERE id = ?",
                Boolean.class,
                나.id(),
                활동))
        .isTrue();
  }

  @Test
  void 지워진_진행_중_활동이_남아_있으면_새_시작은_409_다() throws Exception {
    TestAccount 나 = 크루원이_된다("act-deleted@test.io");
    UUID 지운_활동 = 진행_중_활동(나);
    jdbcTemplate.update("UPDATE activities SET deleted_at = now() WHERE id = ?", 지운_활동);

    시작한다(나, UUID.randomUUID(), true)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONFLICT"));
  }

  @Test
  void 소속_크루가_없으면_403_NO_CREW_남의_활동_id_면_403_이다() throws Exception {
    TestAccount 미가입자 = 가입한다(mockMvc, "act-nocrew@test.io");
    시작한다(미가입자, UUID.randomUUID(), true)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("NO_CREW"));

    TestAccount 나 = 크루원이_된다("act-owner@test.io");
    TestAccount 남 = 크루원이_된다("act-other@test.io");
    UUID 활동 = 진행_중_활동(나);

    시작한다(남, 활동, true).andExpect(status().isForbidden());
    mockMvc.perform(일시정지(남, 활동)).andExpect(status().isForbidden());
    mockMvc
        .perform(줍는다(남, 활동, null, 줍기(UUID.randomUUID(), "CAN", 1)))
        .andExpect(status().isForbidden());
  }

  @Test
  void 현재_활동은_진행_중이면_돌려주고_없으면_null_이다() throws Exception {
    TestAccount 나 = 크루원이_된다("act-current@test.io");
    mockMvc.perform(현재(나)).andExpect(status().isOk()).andExpect(jsonPath("$.data").isEmpty());

    UUID 활동 = 진행_중_활동(나);
    mockMvc.perform(줍는다(나, 활동, null, 줍기(UUID.randomUUID(), "CAN", 2)));

    mockMvc
        .perform(현재(나))
        .andExpect(jsonPath("$.data.id").value(활동.toString()))
        .andExpect(jsonPath("$.data.itemCount").value(2))
        .andExpect(jsonPath("$.data.items.length()").value(1));
  }

  @Test
  void 일시정지와_재개는_재전송해도_204_이고_일시정지_시간을_한_번만_더한다() throws Exception {
    TestAccount 나 = 크루원이_된다("act-pause@test.io");
    UUID 활동 = 진행_중_활동(나);

    mockMvc.perform(일시정지(나, 활동)).andExpect(status().isNoContent());
    mockMvc.perform(일시정지(나, 활동)).andExpect(status().isNoContent());
    mockMvc
        .perform(현재(나))
        .andExpect(jsonPath("$.data.status").value("IN_PROGRESS"))
        .andExpect(jsonPath("$.data.paused").value(true))
        .andExpect(jsonPath("$.data.pausedAt").isNotEmpty());

    jdbcTemplate.update(
        "UPDATE activities SET paused_at = now() - interval '60 seconds' WHERE id = ?", 활동);
    mockMvc.perform(재개(나, 활동)).andExpect(status().isNoContent());
    mockMvc.perform(재개(나, 활동)).andExpect(status().isNoContent());

    mockMvc
        .perform(현재(나))
        .andExpect(jsonPath("$.data.paused").value(false))
        .andExpect(jsonPath("$.data.pausedAt").isEmpty());
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT paused_sec FROM activities WHERE id = ?", Integer.class, 활동))
        .isBetween(60, 62);
  }

  @Test
  void 끝난_활동의_일시정지와_줍기는_409_다() throws Exception {
    TestAccount 나 = 크루원이_된다("act-ended@test.io");
    UUID 활동 = 진행_중_활동(나);
    jdbcTemplate.update(
        "UPDATE activities SET status = 'ENDED', ended_at = now() WHERE id = ?", 활동);

    mockMvc.perform(일시정지(나, 활동)).andExpect(status().isConflict());
    mockMvc
        .perform(줍는다(나, 활동, null, 줍기(UUID.randomUUID(), "CAN", 1)))
        .andExpect(status().isConflict());
  }

  @Test
  void 같은_id_줍기를_두_번_보내면_한_건이고_사진_없는_줍기도_저장된다() throws Exception {
    TestAccount 나 = 크루원이_된다("act-items@test.io");
    UUID 활동 = 진행_중_활동(나);
    UUID 꽁초 = UUID.randomUUID();
    UUID 캔 = UUID.randomUUID();
    String 두_건 = 줍기(꽁초, "CIGARETTE", 3) + "," + 줍기(캔, "CAN", 1);

    mockMvc
        .perform(줍는다(나, 활동, null, 두_건))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.itemCount").value(4))
        .andExpect(jsonPath("$.data.byCategory.CIGARETTE").value(3))
        .andExpect(jsonPath("$.data.byCategory.CAN").value(1))
        .andExpect(jsonPath("$.data.items[0].id").value(꽁초.toString()))
        .andExpect(jsonPath("$.data.items[0].photoId").isEmpty())
        .andExpect(jsonPath("$.data.items[0].source").value("MANUAL"))
        .andExpect(jsonPath("$.data.items[0].unclassified").value(false))
        .andExpect(jsonPath("$.data.items[0].bbox").isEmpty());
    mockMvc
        .perform(줍는다(나, 활동, null, 줍기(꽁초, "CIGARETTE", 3)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.itemCount").value(4))
        .andExpect(jsonPath("$.data.items.length()").value(1));

    assertThat(줍기_수(활동)).isEqualTo(2);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT item_count FROM activities WHERE id = ?", Integer.class, 활동))
        .isEqualTo(4);
  }

  @Test
  void 사진의_AI_줍기는_신뢰도_0_7_미만이면_unclassified_고_남의_사진은_404_다() throws Exception {
    TestAccount 나 = 크루원이_된다("act-photo@test.io");
    UUID 활동 = 진행_중_활동(나);
    UUID 사진 = 사진을_넣는다(나, 활동);
    UUID 남의_사진 = 사진을_넣는다(나, 진행_중_활동(크루원이_된다("act-photo-other@test.io")));
    String AI_줍기 =
        "{\"id\":\"%s\",\"category\":\"PLASTIC\",\"quantity\":1,\"aiPredictedCategory\":\"PLASTIC\",\"aiConfidence\":0.42,\"bbox\":{\"x\":0.1,\"y\":0.2,\"w\":0.3,\"h\":0.4}}"
            .formatted(UUID.randomUUID());

    mockMvc
        .perform(줍는다(나, 활동, 사진, AI_줍기))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items[0].photoId").value(사진.toString()))
        .andExpect(jsonPath("$.data.items[0].source").value("AI"))
        .andExpect(jsonPath("$.data.items[0].unclassified").value(true))
        .andExpect(jsonPath("$.data.items[0].bbox.w").value(0.3));
    mockMvc
        .perform(줍는다(나, 활동, 남의_사진, 줍기(UUID.randomUUID(), "CAN", 1)))
        .andExpect(status().isNotFound());
  }

  @Test
  void 칠_종_밖_카테고리와_수량_0_과_사진_없는_bbox_는_422_다() throws Exception {
    TestAccount 나 = 크루원이_된다("act-invalid@test.io");
    UUID 활동 = 진행_중_활동(나);
    String bbox만 =
        "{\"id\":\"%s\",\"category\":\"CAN\",\"quantity\":1,\"bbox\":{\"x\":0.1,\"y\":0.2,\"w\":0.3,\"h\":0.4}}"
            .formatted(UUID.randomUUID());

    mockMvc
        .perform(줍는다(나, 활동, null, 줍기(UUID.randomUUID(), "BATTERY", 1)))
        .andExpect(status().isUnprocessableEntity());
    mockMvc
        .perform(줍는다(나, 활동, null, 줍기(UUID.randomUUID(), "CAN", 0)))
        .andExpect(status().isUnprocessableEntity());
    mockMvc.perform(줍는다(나, 활동, null, bbox만)).andExpect(status().isUnprocessableEntity());
    assertThat(줍기_수(활동)).isZero();
  }

  @Test
  void 줍기를_고치면_합계가_바뀌고_지운_줍기를_다시_지워도_204_다() throws Exception {
    TestAccount 나 = 크루원이_된다("act-edit@test.io");
    UUID 활동 = 진행_중_활동(나);
    UUID 줍기_id = UUID.randomUUID();
    mockMvc.perform(줍는다(나, 활동, null, 줍기(줍기_id, "CAN", 2)));

    mockMvc
        .perform(
            patch("/api/v1/activities/{id}/items/{itemId}", 활동, 줍기_id)
                .header(HttpHeaders.AUTHORIZATION, 나.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"category\":\"PAPER\",\"quantity\":5}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.itemCount").value(5))
        .andExpect(jsonPath("$.data.byCategory.PAPER").value(5))
        .andExpect(jsonPath("$.data.byCategory.CAN").doesNotExist());

    mockMvc.perform(줍기를_지운다(나, 활동, 줍기_id)).andExpect(status().isNoContent());
    mockMvc.perform(줍기를_지운다(나, 활동, 줍기_id)).andExpect(status().isNoContent());
    mockMvc
        .perform(현재(나))
        .andExpect(jsonPath("$.data.itemCount").value(0))
        .andExpect(jsonPath("$.data.items.length()").value(0));
  }

  @Test
  void 진행_중_활동이_있으면_로그아웃은_409_다() throws Exception {
    String 응답 =
        mockMvc
            .perform(
                post("/api/v1/auth/signup")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(가입_본문("act-logout@test.io")))
            .andReturn()
            .getResponse()
            .getContentAsString();
    String accessToken = JsonPath.read(응답, "$.data.accessToken");
    String refreshToken = JsonPath.read(응답, "$.data.refreshToken");
    TestAccount 나 = new TestAccount(UUID.fromString(내_id(mockMvc, accessToken)), accessToken);
    크루를_만든다(나);
    UUID 활동 = 진행_중_활동(나);

    mockMvc
        .perform(로그아웃(refreshToken))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONFLICT"));

    jdbcTemplate.update(
        "UPDATE activities SET status = 'ENDED', ended_at = now() WHERE id = ?", 활동);
    mockMvc.perform(로그아웃(refreshToken)).andExpect(status().isNoContent());
  }

  @Test
  void 시작이_사용자_잠금을_기다리는_사이_크루를_나가면_403_NO_CREW_이고_활동은_없다() throws Exception {
    TestAccount 나 = 크루원이_된다("act-race@test.io");
    UUID 활동 = UUID.randomUUID();
    ExecutorService 손 = Executors.newSingleThreadExecutor();
    try (Connection 나가기 = dataSource.getConnection()) {
      나가기.setAutoCommit(false);
      try (PreparedStatement 잠금 =
          나가기.prepareStatement(
              "SELECT pg_advisory_xact_lock(hashtextextended(CAST(? AS text), 0))")) {
        잠금.setObject(1, 나.id());
        잠금.executeQuery();
      }
      Future<Integer> 시작 = 손.submit(() -> 시작한다(나, 활동, true).andReturn().getResponse().getStatus());
      사용자_잠금을_기다릴_때까지_본다();
      try (PreparedStatement 지운다 =
          나가기.prepareStatement("DELETE FROM crew_members WHERE user_id = ?")) {
        지운다.setObject(1, 나.id());
        지운다.executeUpdate();
      }
      나가기.commit();

      assertThat(시작.get(10, TimeUnit.SECONDS)).isEqualTo(403);
    } finally {
      손.shutdown();
    }
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM activities WHERE id = ?", Integer.class, 활동))
        .isZero();
  }

  private TestAccount 크루원이_된다(String 이메일) throws Exception {
    TestAccount 계정 = 가입한다(mockMvc, 이메일);
    크루를_만든다(계정);
    return 계정;
  }

  private void 크루를_만든다(TestAccount 계정) throws Exception {
    mockMvc
        .perform(
            post("/api/v1/crews")
                .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"name\":\"크루%s\",\"region\":\"SEOUL\",\"joinPolicy\":\"OPEN\"}"
                        .formatted(UUID.randomUUID().toString().substring(0, 8))))
        .andExpect(status().isCreated());
  }

  private UUID 진행_중_활동(TestAccount 계정) throws Exception {
    UUID 활동 = UUID.randomUUID();
    시작한다(계정, 활동, false).andExpect(status().isCreated());
    return 활동;
  }

  private UUID 사진을_넣는다(TestAccount 주인, UUID 활동) {
    UUID 미디어 = UUID.randomUUID();
    UUID 사진 = UUID.randomUUID();
    jdbcTemplate.update(
        "INSERT INTO media (id, owner_id, object_key, thumb_key) VALUES (?, ?, 'o', 't')",
        미디어,
        주인.id());
    jdbcTemplate.update(
        "INSERT INTO activity_photos (id, activity_id, media_id, taken_at, inference_status,"
            + " order_index) VALUES (?, ?, ?, now(), 'OK', 0)",
        사진,
        활동,
        미디어);
    return 사진;
  }

  private void 사용자_잠금을_기다릴_때까지_본다() throws InterruptedException {
    for (int i = 0; i < 100; i++) {
      Integer 대기 =
          jdbcTemplate.queryForObject(
              "SELECT count(*) FROM pg_stat_activity WHERE wait_event = 'advisory'", Integer.class);
      if (대기 > 0) {
        return;
      }
      Thread.sleep(50);
    }
    throw new AssertionError("시작 요청이 사용자 잠금을 기다리지 않는다");
  }

  private int 줍기_수(UUID 활동) {
    return jdbcTemplate.queryForObject(
        "SELECT count(*) FROM activity_items WHERE activity_id = ?", Integer.class, 활동);
  }

  private ResultActions 시작한다(TestAccount 계정, UUID 활동, boolean 위치_공유) throws Exception {
    return mockMvc.perform(
        post("/api/v1/activities")
            .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                "{\"id\":\"%s\",\"startedAt\":\"2026-10-13T09:00:00Z\",\"locationShared\":%s}"
                    .formatted(활동, 위치_공유)));
  }

  private static String 줍기(UUID id, String 카테고리, int 수량) {
    return "{\"id\":\"%s\",\"category\":\"%s\",\"quantity\":%d}".formatted(id, 카테고리, 수량);
  }

  private static MockHttpServletRequestBuilder 줍는다(TestAccount 계정, UUID 활동, UUID 사진, String 줍기들) {
    return post("/api/v1/activities/{id}/items", 활동)
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content(
            "{\"photoId\":%s,\"items\":[%s]}"
                .formatted(사진 == null ? "null" : "\"" + 사진 + "\"", 줍기들));
  }

  private static MockHttpServletRequestBuilder 줍기를_지운다(TestAccount 계정, UUID 활동, UUID 줍기) {
    return delete("/api/v1/activities/{id}/items/{itemId}", 활동, 줍기)
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private static MockHttpServletRequestBuilder 현재(TestAccount 계정) {
    return get("/api/v1/activities/current").header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private static MockHttpServletRequestBuilder 일시정지(TestAccount 계정, UUID 활동) {
    return post("/api/v1/activities/{id}/pause", 활동).header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private static MockHttpServletRequestBuilder 재개(TestAccount 계정, UUID 활동) {
    return post("/api/v1/activities/{id}/resume", 활동)
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private static MockHttpServletRequestBuilder 로그아웃(String refreshToken) {
    return post("/api/v1/auth/logout")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"refreshToken\":\"%s\"}".formatted(refreshToken));
  }
}
