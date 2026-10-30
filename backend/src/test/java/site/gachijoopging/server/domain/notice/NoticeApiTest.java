package site.gachijoopging.server.domain.notice;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static site.gachijoopging.server.support.TestAccounts.가입한다;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.awaitility.Awaitility;
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
class NoticeApiTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private DataSource dataSource;

  @Test
  void 최신_공지_한_건만_고정되고_지우면_이전_공지가_고정된다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("notice-pin-leader@test.io");
    TestAccount 나 = 크루원이_된다("notice-pin-me@test.io", 크루장);
    UUID 옛_공지 = 쓴다(크루장, "9월 안내", "9월 본문");
    UUID 새_공지 = 쓴다(크루장, "10월 안내", "10월 본문");
    시각을_바꾼다(옛_공지, "2026-09-01T00:00:00Z");
    시각을_바꾼다(새_공지, "2026-10-01T00:00:00Z");

    JsonNode 목록 = 목록(나);
    assertThat(ids(목록)).containsExactly(새_공지.toString(), 옛_공지.toString());
    assertThat(목록.path("items").get(0).path("pinned").asBoolean()).isTrue();
    assertThat(목록.path("items").get(1).path("pinned").asBoolean()).isFalse();
    크루(나)
        .andExpect(jsonPath("$.data.pinnedNotice.id").value(새_공지.toString()))
        .andExpect(jsonPath("$.data.pinnedNotice.title").value("10월 안내"));

    JsonNode 첫_장 = 본문(mockMvc.perform(목록_요청(나).param("limit", "1")));
    assertThat(ids(첫_장)).containsExactly(새_공지.toString());
    JsonNode 둘째_장 =
        본문(
            mockMvc.perform(
                목록_요청(나).param("limit", "1").param("cursor", 첫_장.path("nextCursor").asText())));
    assertThat(ids(둘째_장)).containsExactly(옛_공지.toString());
    assertThat(둘째_장.path("nextCursor").isNull()).isTrue();

    mockMvc.perform(지운다(크루장, 새_공지)).andExpect(status().isNoContent());

    목록 = 목록(나);
    assertThat(ids(목록)).containsExactly(옛_공지.toString());
    assertThat(목록.path("items").get(0).path("pinned").asBoolean()).isTrue();
    크루(나).andExpect(jsonPath("$.data.pinnedNotice.id").value(옛_공지.toString()));
    상세(나, 새_공지).andExpect(status().isNotFound());
  }

  @Test
  void 공지가_없으면_pinnedNotice_는_null_이다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("notice-none-leader@test.io");

    크루(크루장).andExpect(jsonPath("$.data.pinnedNotice").isEmpty());
  }

  @Test
  void 상세에는_본문과_댓글이_오래된_것부터_오고_미리보기는_줄바꿈을_공백으로_100자까지다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("notice-detail-leader@test.io");
    TestAccount 나 = 크루원이_된다("notice-detail-me@test.io", 크루장);
    String 긴_본문 = "첫 줄\n둘째 줄\r\n" + "😀".repeat(200);
    UUID 공지 = 쓴다(크루장, "  안내  ", 긴_본문);
    UUID 첫_댓글 = 댓글을_단다(나, 공지, "확인했습니다");
    UUID 둘째_댓글 = 댓글을_단다(크루장, 공지, "비 오면 미뤄요");
    댓글_시각을_바꾼다(첫_댓글, "2026-10-01T00:00:00Z");
    댓글_시각을_바꾼다(둘째_댓글, "2026-10-02T00:00:00Z");

    String 미리보기 = "첫 줄 둘째 줄 " + "😀".repeat(91);
    상세(나, 공지)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.title").value("안내"))
        .andExpect(jsonPath("$.data.body").value(긴_본문))
        .andExpect(jsonPath("$.data.preview").value(미리보기))
        .andExpect(jsonPath("$.data.pinned").value(true))
        .andExpect(jsonPath("$.data.commentCount").value(2))
        .andExpect(jsonPath("$.data.comments[0].id").value(첫_댓글.toString()))
        .andExpect(jsonPath("$.data.comments[0].author.id").value(나.id().toString()))
        .andExpect(jsonPath("$.data.comments[1].id").value(둘째_댓글.toString()));
  }

  @Test
  void 같은_id_로_다시_쓰면_200_으로_한_건만_생긴다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("notice-retry-leader@test.io");
    UUID id = UUID.randomUUID();

    mockMvc
        .perform(작성(크루장, id, "한 번만", "본문"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.pinned").value(true));
    mockMvc
        .perform(작성(크루장, id, "한 번만", "본문"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.id").value(id.toString()));

    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM notices WHERE id = ?", Long.class, id))
        .isEqualTo(1);
  }

  @Test
  void 크루원은_공지를_쓰거나_고치거나_지울_수_없고_크루장은_보낸_필드만_고친다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("notice-perm-leader@test.io");
    TestAccount 나 = 크루원이_된다("notice-perm-me@test.io", 크루장);
    UUID 공지 = 쓴다(크루장, "원래 제목", "원래 본문");

    mockMvc.perform(작성(나, UUID.randomUUID(), "크루원 공지", "본문")).andExpect(status().isForbidden());
    mockMvc.perform(고친다(나, 공지, Map.of("title", "몰래"))).andExpect(status().isForbidden());
    mockMvc.perform(지운다(나, 공지)).andExpect(status().isForbidden());

    mockMvc.perform(고친다(크루장, 공지, Map.of("title", " 바뀐 제목 "))).andExpect(status().isNoContent());
    상세(나, 공지)
        .andExpect(jsonPath("$.data.title").value("바뀐 제목"))
        .andExpect(jsonPath("$.data.body").value("원래 본문"));
  }

  @Test
  void 공지_댓글은_작성자와_크루장만_지운다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("notice-cdel-leader@test.io");
    TestAccount 나 = 크루원이_된다("notice-cdel-me@test.io", 크루장);
    TestAccount 옆 = 크루원이_된다("notice-cdel-other@test.io", 크루장);
    UUID 공지 = 쓴다(크루장, "댓글 지우기", "본문");
    UUID 내_댓글 = 댓글을_단다(나, 공지, "지워질 댓글");
    UUID 내가_지울_댓글 = 댓글을_단다(나, 공지, "내가 지울 댓글");

    mockMvc.perform(댓글_삭제(옆, 내_댓글)).andExpect(status().isForbidden());

    mockMvc.perform(댓글_삭제(크루장, 내_댓글)).andExpect(status().isNoContent());
    mockMvc.perform(댓글_삭제(나, 내가_지울_댓글)).andExpect(status().isNoContent());

    assertThat(댓글_지운_사람(내_댓글)).isEqualTo(크루장.id());
    assertThat(댓글_지운_사람(내가_지울_댓글)).isNull();
    상세(나, 공지)
        .andExpect(jsonPath("$.data.commentCount").value(0))
        .andExpect(jsonPath("$.data.comments").isEmpty());
    mockMvc.perform(댓글_삭제(나, 내가_지울_댓글)).andExpect(status().isNotFound());
  }

  @Test
  void 다른_크루의_공지는_403_이고_지운_공지는_404_다() throws Exception {
    TestAccount 우리_크루장 = 크루를_만든다("notice-other-ours@test.io");
    TestAccount 남의_크루장 = 크루를_만든다("notice-other-theirs@test.io");
    UUID 남의_공지 = 쓴다(남의_크루장, "남의 공지", "본문");
    UUID 남의_댓글 = 댓글을_단다(남의_크루장, 남의_공지, "남의 댓글");

    상세(우리_크루장, 남의_공지).andExpect(status().isForbidden());
    mockMvc.perform(고친다(우리_크루장, 남의_공지, Map.of("title", "몰래"))).andExpect(status().isForbidden());
    mockMvc.perform(지운다(우리_크루장, 남의_공지)).andExpect(status().isForbidden());
    mockMvc
        .perform(댓글_작성(우리_크루장, 남의_공지, UUID.randomUUID(), "몰래"))
        .andExpect(status().isForbidden());
    mockMvc.perform(댓글_삭제(우리_크루장, 남의_댓글)).andExpect(status().isForbidden());
    assertThat(ids(목록(우리_크루장))).doesNotContain(남의_공지.toString());

    mockMvc.perform(지운다(남의_크루장, 남의_공지)).andExpect(status().isNoContent());
    상세(남의_크루장, 남의_공지).andExpect(status().isNotFound());
    mockMvc
        .perform(댓글_작성(남의_크루장, 남의_공지, UUID.randomUUID(), "늦은 댓글"))
        .andExpect(status().isNotFound());
  }

  @Test
  void 빈_제목_본문과_길이를_넘는_공지는_422_다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("notice-invalid-leader@test.io");
    UUID 공지 = 쓴다(크루장, "제목", "본문");

    mockMvc
        .perform(작성(크루장, UUID.randomUUID(), "  ", "본문"))
        .andExpect(status().isUnprocessableEntity());
    mockMvc
        .perform(작성(크루장, UUID.randomUUID(), "제목", "\n"))
        .andExpect(status().isUnprocessableEntity());
    mockMvc
        .perform(작성(크루장, UUID.randomUUID(), "가".repeat(101), "본문"))
        .andExpect(status().isUnprocessableEntity());
    mockMvc
        .perform(작성(크루장, UUID.randomUUID(), "제목", "가".repeat(3001)))
        .andExpect(status().isUnprocessableEntity());
    mockMvc
        .perform(작성(크루장, UUID.randomUUID(), "😀".repeat(100), "😀".repeat(3000)))
        .andExpect(status().isCreated());
    mockMvc.perform(고친다(크루장, 공지, Map.of("body", " "))).andExpect(status().isUnprocessableEntity());
    mockMvc
        .perform(댓글_작성(크루장, 공지, UUID.randomUUID(), " "))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void 차단한_사람의_공지_댓글은_숨지만_그_사람의_공지는_보인다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("notice-block-leader@test.io");
    TestAccount 나 = 크루원이_된다("notice-block-me@test.io", 크루장);
    UUID 공지 = 쓴다(크루장, "차단해도 보이는 공지", "본문");
    UUID 크루장_댓글 = 댓글을_단다(크루장, 공지, "숨을 댓글");
    UUID 내_댓글 = 댓글을_단다(나, 공지, "남을 댓글");
    jdbcTemplate.update(
        "INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?)", 나.id(), 크루장.id());

    상세(나, 공지)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.commentCount").value(1))
        .andExpect(jsonPath("$.data.comments[0].id").value(내_댓글.toString()));
    assertThat(목록(나).path("items").get(0).path("commentCount").asLong()).isEqualTo(1);
    크루(나).andExpect(jsonPath("$.data.pinnedNotice.id").value(공지.toString()));
    mockMvc.perform(댓글_삭제(나, 크루장_댓글)).andExpect(status().isNotFound());
    상세(크루장, 공지).andExpect(jsonPath("$.data.commentCount").value(2));
  }

  @Test
  void 위임이_커밋되기를_기다린_공지_작성은_옛_크루장_권한으로_쓰지_못한다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("notice-delegate-race-leader@test.io");
    TestAccount 나 = 크루원이_된다("notice-delegate-race-me@test.io", 크루장);
    UUID id = UUID.randomUUID();

    try (Connection 위임 = dataSource.getConnection()) {
      위임.setAutoCommit(false);
      try (PreparedStatement 바꾸기 =
          위임.prepareStatement("UPDATE crews SET leader_id = ? WHERE leader_id = ?")) {
        바꾸기.setObject(1, 나.id());
        바꾸기.setObject(2, 크루장.id());
        바꾸기.executeUpdate();
      }
      CompletableFuture<ResultActions> 작성_결과 = 따로_보낸다(작성(크루장, id, "늦은 공지", "본문"));
      잠금을_기다린다();
      위임.commit();

      작성_결과.get(10, TimeUnit.SECONDS).andExpect(status().isForbidden());
    }
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM notices WHERE id = ?", Long.class, id))
        .isZero();
  }

  @Test
  void 추방이_커밋되기를_기다린_공지_댓글은_옛_크루에_남지_않는다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("notice-expel-race-leader@test.io");
    TestAccount 나 = 크루원이_된다("notice-expel-race-me@test.io", 크루장);
    UUID 공지 = 쓴다(크루장, "추방 경합", "본문");
    UUID id = UUID.randomUUID();

    try (Connection 추방 = dataSource.getConnection()) {
      추방.setAutoCommit(false);
      try (PreparedStatement 지우기 =
          추방.prepareStatement("DELETE FROM crew_members WHERE user_id = ?")) {
        지우기.setObject(1, 나.id());
        지우기.executeUpdate();
      }
      CompletableFuture<ResultActions> 작성_결과 = 따로_보낸다(댓글_작성(나, 공지, id, "늦은 댓글"));
      잠금을_기다린다();
      추방.commit();

      작성_결과
          .get(10, TimeUnit.SECONDS)
          .andExpect(status().isForbidden())
          .andExpect(jsonPath("$.code").value("NO_CREW"));
    }
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM notice_comments WHERE id = ?", Long.class, id))
        .isZero();
  }

  @Test
  void 삭제가_커밋되기를_기다린_수정은_지운_공지를_되살리지_않는다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("notice-delete-race-leader@test.io");
    UUID 공지 = 쓴다(크루장, "지워질 공지", "본문");

    try (Connection 삭제 = dataSource.getConnection()) {
      삭제.setAutoCommit(false);
      try (PreparedStatement 지우기 =
          삭제.prepareStatement("UPDATE notices SET deleted_at = now() WHERE id = ?")) {
        지우기.setObject(1, 공지);
        지우기.executeUpdate();
      }
      CompletableFuture<ResultActions> 수정_결과 = 따로_보낸다(고친다(크루장, 공지, Map.of("title", "늦은 수정")));
      잠금을_기다린다();
      삭제.commit();

      수정_결과.get(10, TimeUnit.SECONDS).andExpect(status().isNotFound());
    }
    상세(크루장, 공지).andExpect(status().isNotFound());
  }

  private CompletableFuture<ResultActions> 따로_보낸다(MockHttpServletRequestBuilder 요청) {
    return CompletableFuture.supplyAsync(
        () -> {
          try {
            return mockMvc.perform(요청);
          } catch (Exception e) {
            throw new IllegalStateException(e);
          }
        });
  }

  private void 잠금을_기다린다() {
    Awaitility.await()
        .atMost(Duration.ofSeconds(10))
        .until(
            () ->
                jdbcTemplate.queryForObject(
                        "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'",
                        Long.class)
                    > 0);
  }

  private TestAccount 크루를_만든다(String 이메일) throws Exception {
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

  private TestAccount 크루원이_된다(String 이메일, TestAccount 크루장) throws Exception {
    TestAccount 계정 = 가입한다(mockMvc, 이메일);
    jdbcTemplate.update(
        "INSERT INTO crew_members (crew_id, user_id, joined_at)"
            + " SELECT crew_id, ?, now() FROM crew_members WHERE user_id = ?",
        계정.id(),
        크루장.id());
    return 계정;
  }

  private UUID 쓴다(TestAccount 계정, String 제목, String 본문) throws Exception {
    UUID id = UUID.randomUUID();
    mockMvc.perform(작성(계정, id, 제목, 본문)).andExpect(status().isCreated());
    return id;
  }

  private MockHttpServletRequestBuilder 작성(TestAccount 계정, UUID id, String 제목, String 본문)
      throws Exception {
    return post("/api/v1/crew/notices")
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(Map.of("id", id, "title", 제목, "body", 본문)));
  }

  private MockHttpServletRequestBuilder 고친다(TestAccount 계정, UUID 공지, Map<String, String> 필드)
      throws Exception {
    return patch("/api/v1/notices/{noticeId}", 공지)
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(필드));
  }

  private static MockHttpServletRequestBuilder 지운다(TestAccount 계정, UUID 공지) {
    return delete("/api/v1/notices/{noticeId}", 공지).header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private static MockHttpServletRequestBuilder 목록_요청(TestAccount 계정) {
    return get("/api/v1/crew/notices").header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private JsonNode 목록(TestAccount 계정) throws Exception {
    return 본문(mockMvc.perform(목록_요청(계정)).andExpect(status().isOk()));
  }

  private ResultActions 상세(TestAccount 계정, UUID 공지) throws Exception {
    return mockMvc.perform(
        get("/api/v1/notices/{noticeId}", 공지).header(HttpHeaders.AUTHORIZATION, 계정.bearer()));
  }

  private ResultActions 크루(TestAccount 계정) throws Exception {
    return mockMvc
        .perform(get("/api/v1/crew").header(HttpHeaders.AUTHORIZATION, 계정.bearer()))
        .andExpect(status().isOk());
  }

  private UUID 댓글을_단다(TestAccount 계정, UUID 공지, String 댓글) throws Exception {
    UUID id = UUID.randomUUID();
    mockMvc.perform(댓글_작성(계정, 공지, id, 댓글)).andExpect(status().isCreated());
    return id;
  }

  private MockHttpServletRequestBuilder 댓글_작성(TestAccount 계정, UUID 공지, UUID id, String 댓글)
      throws Exception {
    return post("/api/v1/notices/{noticeId}/comments", 공지)
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(Map.of("id", id, "text", 댓글)));
  }

  private static MockHttpServletRequestBuilder 댓글_삭제(TestAccount 계정, UUID 댓글) {
    return delete("/api/v1/notice-comments/{commentId}", 댓글)
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private void 시각을_바꾼다(UUID 공지, String 시각) {
    jdbcTemplate.update(
        "UPDATE notices SET created_at = ? WHERE id = ?", Timestamp.from(Instant.parse(시각)), 공지);
  }

  private void 댓글_시각을_바꾼다(UUID 댓글, String 시각) {
    jdbcTemplate.update(
        "UPDATE notice_comments SET created_at = ? WHERE id = ?",
        Timestamp.from(Instant.parse(시각)),
        댓글);
  }

  private UUID 댓글_지운_사람(UUID 댓글) {
    return jdbcTemplate.queryForObject(
        "SELECT deleted_by FROM notice_comments WHERE id = ?", UUID.class, 댓글);
  }

  private JsonNode 본문(ResultActions 결과) throws Exception {
    return objectMapper.readTree(결과.andReturn().getResponse().getContentAsString()).path("data");
  }

  private static List<String> ids(JsonNode 페이지) {
    List<String> ids = new ArrayList<>();
    페이지.path("items").forEach(공지 -> ids.add(공지.path("id").asText()));
    return ids;
  }
}
