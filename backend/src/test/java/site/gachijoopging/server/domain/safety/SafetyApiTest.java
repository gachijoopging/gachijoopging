package site.gachijoopging.server.domain.safety;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static site.gachijoopging.server.support.TestAccounts.가입한다;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
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
class SafetyApiTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private DataSource dataSource;

  @Test
  void 차단하면_차단자에게만_대상의_글이_숨고_대상에게는_차단자의_글이_그대로_보인다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("safety-block-leader@test.io");
    TestAccount 나 = 크루원이_된다("safety-block-me@test.io", 크루장);
    UUID 크루장_글 = 쓴다(크루장, "차단당할 글");
    UUID 내_글 = 쓴다(나, "차단한 사람의 글");

    mockMvc.perform(차단(나, 크루장.id())).andExpect(status().isNoContent());
    mockMvc.perform(차단(나, 크루장.id())).andExpect(status().isNoContent());

    assertThat(피드_id(나)).contains(내_글.toString()).doesNotContain(크루장_글.toString());
    assertThat(피드_id(크루장)).contains(크루장_글.toString(), 내_글.toString());

    mockMvc
        .perform(delete("/api/v1/users/{userId}/block", 크루장.id()).header(인증, 나.bearer()))
        .andExpect(status().isNoContent());
    assertThat(피드_id(나)).contains(크루장_글.toString());
  }

  @Test
  void 자기_자신이나_없는_사용자를_차단해도_204_이고_행은_생기지_않는다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "safety-block-self@test.io");

    mockMvc.perform(차단(나, 나.id())).andExpect(status().isNoContent());
    mockMvc.perform(차단(나, UUID.randomUUID())).andExpect(status().isNoContent());

    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM blocks WHERE blocker_id = ?", Long.class, 나.id()))
        .isZero();
  }

  @Test
  void 차단_목록은_최근_차단_순이고_total_은_커서와_무관한_전체_수다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "safety-blocked-list@test.io");
    TestAccount 먼저 = 가입한다(mockMvc, "safety-blocked-first@test.io");
    TestAccount 나중 = 가입한다(mockMvc, "safety-blocked-later@test.io");
    mockMvc.perform(차단(나, 먼저.id())).andExpect(status().isNoContent());
    mockMvc.perform(차단(나, 나중.id())).andExpect(status().isNoContent());

    JsonNode 첫_장 = 본문(mockMvc.perform(차단_목록(나).param("limit", "1")).andExpect(status().isOk()));
    assertThat(ids(첫_장)).containsExactly(나중.id().toString());
    assertThat(첫_장.path("total").asLong()).isEqualTo(2);

    JsonNode 둘째_장 =
        본문(
            mockMvc
                .perform(
                    차단_목록(나).param("limit", "1").param("cursor", 첫_장.path("nextCursor").asText()))
                .andExpect(status().isOk()));
    assertThat(ids(둘째_장)).containsExactly(먼저.id().toString());
    assertThat(둘째_장.path("nextCursor").isNull()).isTrue();
    assertThat(둘째_장.path("total").asLong()).isEqualTo(2);
  }

  @Test
  void 같은_대상을_다시_신고하면_409_고_같은_id_재전송은_200_으로_흡수한다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("safety-dup-leader@test.io");
    TestAccount 나 = 크루원이_된다("safety-dup-me@test.io", 크루장);
    UUID 글 = 쓴다(크루장, "신고할 글");
    UUID id = UUID.randomUUID();

    mockMvc.perform(신고(나, id, "POST", 글.toString(), "SPAM", null)).andExpect(status().isCreated());
    mockMvc.perform(신고(나, id, "POST", 글.toString(), "SPAM", null)).andExpect(status().isOk());
    mockMvc
        .perform(신고(나, UUID.randomUUID(), "POST", 글.toString().toUpperCase(), "HATE", null))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONFLICT"));

    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM reports WHERE reporter_id = ?", Long.class, 나.id()))
        .isEqualTo(1);
  }

  @Test
  void 기타_사유에_메모가_비면_422_고_다른_크루의_대상은_404_다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("safety-memo-leader@test.io");
    TestAccount 나 = 크루원이_된다("safety-memo-me@test.io", 크루장);
    TestAccount 남 = 크루를_만든다("safety-memo-stranger@test.io");
    UUID 글 = 쓴다(크루장, "신고할 글");

    mockMvc
        .perform(신고(나, UUID.randomUUID(), "POST", 글.toString(), "OTHER", "   "))
        .andExpect(status().isUnprocessableEntity());
    mockMvc
        .perform(신고(나, UUID.randomUUID(), "POST", 쓴다(남, "남의 크루 글").toString(), "SPAM", null))
        .andExpect(status().isNotFound());
    mockMvc
        .perform(신고(나, UUID.randomUUID(), "USER", 남.id().toString(), "SPAM", null))
        .andExpect(status().isNotFound());
  }

  @Test
  void 크루장은_신고하지_못하고_크루원은_자기_자신을_신고하지_못한다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("safety-leader-report@test.io");
    TestAccount 나 = 크루원이_된다("safety-leader-report-me@test.io", 크루장);

    mockMvc
        .perform(신고(크루장, UUID.randomUUID(), "USER", 나.id().toString(), "SPAM", null))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    mockMvc
        .perform(신고(나, UUID.randomUUID(), "USER", 나.id().toString(), "SPAM", null))
        .andExpect(status().isUnprocessableEntity());

    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM reports WHERE crew_id = ?", Long.class, 크루_id(크루장)))
        .isZero();
  }

  @Test
  void 크루장은_먼저_접수된_순으로_대기_신고를_보고_크루원은_403_이다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("safety-list-leader@test.io");
    TestAccount 나 = 크루원이_된다("safety-list-me@test.io", 크루장);
    TestAccount 옆 = 크루원이_된다("safety-list-other@test.io", 크루장);
    UUID 글 = 쓴다(옆, "줄바꿈\n있는 글");
    UUID 먼저 = 신고한다(나, "POST", 글.toString(), "SPAM", null);
    UUID 나중 = 신고한다(나, "USER", 옆.id().toString(), "OTHER", "광고를 올려요");

    JsonNode 목록 = 본문(mockMvc.perform(대기_신고(크루장)).andExpect(status().isOk()));
    assertThat(ids(목록)).containsExactly(먼저.toString(), 나중.toString());
    assertThat(목록.path("items").get(0).path("targetPreview").asText()).isEqualTo("줄바꿈 있는 글");
    assertThat(목록.path("items").get(0).path("memo").isNull()).isTrue();
    assertThat(목록.path("items").get(1).path("reporter").path("id").asText())
        .isEqualTo(나.id().toString());

    mockMvc
        .perform(대기_신고(나))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));
  }

  @Test
  void 사용자_신고에_DELETE_는_422_고_신고는_대기로_남는다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("safety-user-del-leader@test.io");
    TestAccount 나 = 크루원이_된다("safety-user-del-me@test.io", 크루장);
    TestAccount 옆 = 크루원이_된다("safety-user-del-other@test.io", 크루장);
    UUID 신고 = 신고한다(나, "USER", 옆.id().toString(), "HATE", null);

    mockMvc
        .perform(처리(크루장, 신고, "DELETE"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION"));

    assertThat(신고_상태(신고)).containsEntry("status", "PENDING");
    mockMvc.perform(처리(크루장, 신고, "DISMISS")).andExpect(status().isNoContent());
    assertThat(신고_상태(신고))
        .containsEntry("status", "RESOLVED")
        .containsEntry("result", "DISMISS")
        .containsEntry("resolved_by", 크루장.id());
  }

  @Test
  void DELETE_처리는_차단과_무관하게_대상을_지우고_deleted_by_에_크루장을_남긴다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("safety-delete-leader@test.io");
    TestAccount 나 = 크루원이_된다("safety-delete-me@test.io", 크루장);
    TestAccount 옆 = 크루원이_된다("safety-delete-other@test.io", 크루장);
    UUID 글 = 쓴다(옆, "지워질 글");
    UUID 댓글 = 댓글을_단다(옆, 쓴다(크루장, "댓글 달릴 글"));
    UUID 공지_댓글 = 공지_댓글을_단다(옆, 공지를_쓴다(크루장));
    List<UUID> 신고들 =
        List.of(
            신고한다(나, "POST", 글.toString(), "INAPPROPRIATE_PHOTO", null),
            신고한다(나, "COMMENT", 댓글.toString(), "HATE", null),
            신고한다(나, "NOTICE_COMMENT", 공지_댓글.toString(), "SPAM", null));
    mockMvc.perform(차단(크루장, 옆.id())).andExpect(status().isNoContent());

    for (UUID 신고 : 신고들) {
      mockMvc.perform(처리(크루장, 신고, "DELETE")).andExpect(status().isNoContent());
      assertThat(신고_상태(신고)).containsEntry("status", "RESOLVED").containsEntry("result", "DELETE");
    }

    for (String 표 : List.of("posts", "comments", "notice_comments")) {
      UUID 대상 = 표.equals("posts") ? 글 : 표.equals("comments") ? 댓글 : 공지_댓글;
      assertThat(
              jdbcTemplate.queryForMap(
                  "SELECT deleted_at IS NOT NULL AS deleted, deleted_by FROM "
                      + 표
                      + " WHERE id = ?",
                  대상))
          .containsEntry("deleted", true)
          .containsEntry("deleted_by", 크루장.id());
    }
    assertThat(ids(본문(mockMvc.perform(대기_신고(크루장))))).isEmpty();
    mockMvc.perform(처리(크루장, 신고들.getFirst(), "DISMISS")).andExpect(status().isConflict());
  }

  @Test
  void 채팅_메시지_신고는_접수되지만_DELETE_처리는_422_다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("safety-chat-leader@test.io");
    TestAccount 나 = 크루원이_된다("safety-chat-me@test.io", 크루장);
    UUID 메시지 = UUID.randomUUID();
    jdbcTemplate.update(
        "INSERT INTO chat_messages (id, crew_id, seq, author_id, text) VALUES (?, ?, 1, ?, '광고')",
        메시지,
        크루_id(크루장),
        크루장.id());

    UUID 신고 = 신고한다(나, "CHAT_MESSAGE", 메시지.toString(), "SPAM", null);
    assertThat(본문(mockMvc.perform(대기_신고(크루장))).path("items").get(0).path("targetPreview").asText())
        .isEqualTo("광고");

    mockMvc.perform(처리(크루장, 신고, "DELETE")).andExpect(status().isUnprocessableEntity());
    mockMvc.perform(처리(크루장, 신고, "DISMISS")).andExpect(status().isNoContent());
  }

  @Test
  void 크루원이나_다른_크루_크루장은_처리하지_못한다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("safety-forbid-leader@test.io");
    TestAccount 나 = 크루원이_된다("safety-forbid-me@test.io", 크루장);
    TestAccount 남 = 크루를_만든다("safety-forbid-stranger@test.io");
    UUID 신고 = 신고한다(나, "POST", 쓴다(크루장, "신고할 글").toString(), "SPAM", null);

    mockMvc
        .perform(처리(나, 신고, "DISMISS"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    mockMvc.perform(처리(남, 신고, "DISMISS")).andExpect(status().isForbidden());

    assertThat(신고_상태(신고)).containsEntry("status", "PENDING");
  }

  @Test
  void 추방하면_그_사람의_대기_사용자_신고만_결과_없이_닫히고_추방_이력이_남는다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("safety-expel-leader@test.io");
    TestAccount 나 = 크루원이_된다("safety-expel-me@test.io", 크루장);
    TestAccount 옆 = 크루원이_된다("safety-expel-other@test.io", 크루장);
    TestAccount 대상 = 크루원이_된다("safety-expel-target@test.io", 크루장);
    UUID 내_신고 = 신고한다(나, "USER", 대상.id().toString(), "HATE", null);
    UUID 옆_신고 = 신고한다(옆, "USER", 대상.id().toString(), "SPAM", null);
    UUID 글_신고 = 신고한다(나, "POST", 쓴다(대상, "대상의 글").toString(), "SPAM", null);
    UUID 다른_사람_신고 = 신고한다(나, "USER", 옆.id().toString(), "SPAM", null);

    mockMvc
        .perform(delete("/api/v1/crew/members/{userId}", 대상.id()).header(인증, 크루장.bearer()))
        .andExpect(status().isNoContent());

    for (UUID 신고 : List.of(내_신고, 옆_신고)) {
      Map<String, Object> 상태 = 신고_상태(신고);
      assertThat(상태).containsEntry("status", "RESOLVED").containsEntry("resolved_by", 크루장.id());
      assertThat(상태.get("result")).isNull();
    }
    assertThat(신고_상태(글_신고)).containsEntry("status", "PENDING");
    assertThat(신고_상태(다른_사람_신고)).containsEntry("status", "PENDING");
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM crew_expulsions WHERE user_id = ? AND expelled_by = ?",
                Long.class,
                대상.id(),
                크루장.id()))
        .isEqualTo(1);
  }

  @Test
  void 같은_신고를_다른_요청이_먼저_닫았으면_기다린_뒤_409_다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("safety-race-dup-leader@test.io");
    TestAccount 나 = 크루원이_된다("safety-race-dup-me@test.io", 크루장);
    UUID 신고 = 신고한다(나, "POST", 쓴다(크루장, "신고할 글").toString(), "SPAM", null);

    ResultActions 결과 =
        다른_트랜잭션이_잡은_채로(
            "UPDATE reports SET status = 'RESOLVED', result = 'DISMISS', resolved_at = now()"
                + " WHERE id = ?",
            신고,
            처리(크루장, 신고, "DELETE"));

    결과.andExpect(status().isConflict());
    assertThat(신고_상태(신고)).containsEntry("result", "DISMISS");
  }

  @Test
  void 위임이_커밋되기를_기다린_처리는_옛_크루장_권한으로_하지_못한다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("safety-race-delegate-leader@test.io");
    TestAccount 나 = 크루원이_된다("safety-race-delegate-me@test.io", 크루장);
    UUID 신고 = 신고한다(나, "POST", 쓴다(크루장, "신고할 글").toString(), "SPAM", null);

    ResultActions 결과 =
        다른_트랜잭션이_잡은_채로(
            "UPDATE crews SET leader_id = ? WHERE leader_id = '" + 크루장.id() + "'",
            나.id(),
            처리(크루장, 신고, "DISMISS"));

    결과.andExpect(status().isForbidden());
    assertThat(신고_상태(신고)).containsEntry("status", "PENDING");
  }

  @Test
  void 신고자의_추방이_커밋되기를_기다린_신고는_옛_크루에_남지_않는다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("safety-race-reporter-leader@test.io");
    TestAccount 나 = 크루원이_된다("safety-race-reporter-me@test.io", 크루장);
    UUID 글 = 쓴다(크루장, "신고할 글");

    ResultActions 결과 =
        다른_트랜잭션이_잡은_채로(
            "DELETE FROM crew_members WHERE user_id = ?",
            나.id(),
            신고(나, UUID.randomUUID(), "POST", 글.toString(), "SPAM", null));

    결과.andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("NO_CREW"));
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM reports WHERE reporter_id = ?", Long.class, 나.id()))
        .isZero();
  }

  @Test
  void 대상의_추방이_커밋되기를_기다린_사용자_신고는_대기로_남지_않는다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("safety-race-target-leader@test.io");
    TestAccount 나 = 크루원이_된다("safety-race-target-me@test.io", 크루장);
    TestAccount 대상 = 크루원이_된다("safety-race-target@test.io", 크루장);

    ResultActions 결과 =
        다른_트랜잭션이_잡은_채로(
            "DELETE FROM crew_members WHERE user_id = ?",
            대상.id(),
            신고(나, UUID.randomUUID(), "USER", 대상.id().toString(), "SPAM", null));

    결과.andExpect(status().isNotFound());
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM reports WHERE status = 'PENDING' AND target_id = ?",
                Long.class,
                대상.id().toString()))
        .isZero();
  }

  // 다른 연결이 sql 로 행을 잡은 채 요청을 보내고, 요청이 잠금을 기다리기 시작하면 그 연결을 커밋한다
  private ResultActions 다른_트랜잭션이_잡은_채로(String sql, Object 값, MockHttpServletRequestBuilder 요청)
      throws Exception {
    try (Connection 연결 = dataSource.getConnection()) {
      연결.setAutoCommit(false);
      try (PreparedStatement 문장 = 연결.prepareStatement(sql)) {
        문장.setObject(1, 값);
        문장.executeUpdate();
      }
      CompletableFuture<ResultActions> 결과 =
          CompletableFuture.supplyAsync(
              () -> {
                try {
                  return mockMvc.perform(요청);
                } catch (Exception e) {
                  throw new IllegalStateException(e);
                }
              });
      Awaitility.await()
          .atMost(Duration.ofSeconds(10))
          .until(
              () ->
                  jdbcTemplate.queryForObject(
                          "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'",
                          Long.class)
                      > 0);
      연결.commit();
      return 결과.get(10, TimeUnit.SECONDS);
    }
  }

  private static final String 인증 = HttpHeaders.AUTHORIZATION;

  private TestAccount 크루를_만든다(String 이메일) throws Exception {
    TestAccount 계정 = 가입한다(mockMvc, 이메일);
    mockMvc
        .perform(
            post("/api/v1/crews")
                .header(인증, 계정.bearer())
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

  private UUID 크루_id(TestAccount 크루원) {
    return jdbcTemplate.queryForObject(
        "SELECT crew_id FROM crew_members WHERE user_id = ?", UUID.class, 크루원.id());
  }

  private UUID 쓴다(TestAccount 계정, String 글) throws Exception {
    UUID id = UUID.randomUUID();
    mockMvc
        .perform(
            post("/api/v1/crew/posts")
                .header(인증, 계정.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("id", id, "text", 글, "visibility", "CREW", "mediaIds", List.of()))))
        .andExpect(status().isCreated());
    return id;
  }

  private UUID 댓글을_단다(TestAccount 계정, UUID 글) throws Exception {
    UUID id = UUID.randomUUID();
    mockMvc
        .perform(
            post("/api/v1/posts/{postId}/comments", 글)
                .header(인증, 계정.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("id", id, "text", "댓글"))))
        .andExpect(status().isCreated());
    return id;
  }

  private UUID 공지를_쓴다(TestAccount 크루장) throws Exception {
    UUID id = UUID.randomUUID();
    mockMvc
        .perform(
            post("/api/v1/crew/notices")
                .header(인증, 크루장.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(Map.of("id", id, "title", "공지", "body", "본문"))))
        .andExpect(status().isCreated());
    return id;
  }

  private UUID 공지_댓글을_단다(TestAccount 계정, UUID 공지) throws Exception {
    UUID id = UUID.randomUUID();
    mockMvc
        .perform(
            post("/api/v1/notices/{noticeId}/comments", 공지)
                .header(인증, 계정.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("id", id, "text", "공지 댓글"))))
        .andExpect(status().isCreated());
    return id;
  }

  private static MockHttpServletRequestBuilder 차단(TestAccount 계정, UUID 대상) {
    return put("/api/v1/users/{userId}/block", 대상).header(인증, 계정.bearer());
  }

  private static MockHttpServletRequestBuilder 차단_목록(TestAccount 계정) {
    return get("/api/v1/users/me/blocked").header(인증, 계정.bearer());
  }

  private List<String> 피드_id(TestAccount 계정) throws Exception {
    return ids(
        본문(
            mockMvc
                .perform(get("/api/v1/crew/posts").param("scope", "CREW").header(인증, 계정.bearer()))
                .andExpect(status().isOk())));
  }

  private MockHttpServletRequestBuilder 신고(
      TestAccount 계정, UUID id, String 종류, String 대상, String 사유, String 메모) throws Exception {
    Map<String, Object> 본문 = new HashMap<>();
    본문.put("id", id);
    본문.put("targetType", 종류);
    본문.put("targetId", 대상);
    본문.put("reason", 사유);
    if (메모 != null) {
      본문.put("memo", 메모);
    }
    return post("/api/v1/reports")
        .header(인증, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(본문));
  }

  private UUID 신고한다(TestAccount 계정, String 종류, String 대상, String 사유, String 메모) throws Exception {
    UUID id = UUID.randomUUID();
    mockMvc.perform(신고(계정, id, 종류, 대상, 사유, 메모)).andExpect(status().isCreated());
    return id;
  }

  private static MockHttpServletRequestBuilder 대기_신고(TestAccount 계정) {
    return get("/api/v1/crew/reports").header(인증, 계정.bearer());
  }

  private static MockHttpServletRequestBuilder 처리(TestAccount 계정, UUID 신고, String 결과) {
    return post("/api/v1/crew/reports/{reportId}", 신고)
        .header(인증, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"result\":\"%s\"}".formatted(결과));
  }

  private Map<String, Object> 신고_상태(UUID 신고) {
    return jdbcTemplate.queryForMap(
        "SELECT status, result, resolved_by FROM reports WHERE id = ?", 신고);
  }

  private JsonNode 본문(ResultActions 결과) throws Exception {
    return objectMapper.readTree(결과.andReturn().getResponse().getContentAsString()).path("data");
  }

  private static List<String> ids(JsonNode 페이지) {
    List<String> ids = new ArrayList<>();
    페이지.path("items").forEach(항목 -> ids.add(항목.path("id").asText()));
    return ids;
  }
}
