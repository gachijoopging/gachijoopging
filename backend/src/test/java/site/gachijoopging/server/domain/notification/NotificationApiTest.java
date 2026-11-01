package site.gachijoopging.server.domain.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
import site.gachijoopging.server.domain.notification.client.FirebaseFcmClient;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts.TestAccount;

@AutoConfigureMockMvc
class NotificationApiTest extends IntegrationTest {

  private static final String 인증 = HttpHeaders.AUTHORIZATION;

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private DataSource dataSource;
  @Autowired private FirebaseFcmClient fcmClient;

  @Test
  void 공개_크루_가입은_크루장에게_CREW_JOINED_만_가고_비공개_신청은_JOIN_REQUEST_가_간다() throws Exception {
    TestAccount 공개_크루장 = 가입한다(mockMvc, "noti-open-leader@test.io");
    String 공개_크루 = 크루를_만든다(공개_크루장, "OPEN");
    TestAccount 비공개_크루장 = 가입한다(mockMvc, "noti-closed-leader@test.io");
    String 비공개_크루 = 크루를_만든다(비공개_크루장, "APPROVAL");
    TestAccount 가입자 = 가입한다(mockMvc, "noti-open-joiner@test.io");
    TestAccount 신청자 = 가입한다(mockMvc, "noti-closed-applicant@test.io");

    신청한다(가입자, 공개_크루).andExpect(status().isCreated());
    String 신청 = 신청_id(신청한다(신청자, 비공개_크루).andExpect(status().isCreated()));

    assertThat(종류(공개_크루장)).containsExactly("CREW_JOINED");
    assertThat(대상(공개_크루장, "CREW_JOINED")).isEqualTo("MEMBERS:" + 가입자.id());
    assertThat(종류(비공개_크루장)).containsExactly("JOIN_REQUEST");
    assertThat(대상(비공개_크루장, "JOIN_REQUEST")).isEqualTo("JOIN_REQUESTS:" + 신청);
  }

  @Test
  void 공개로_바꿔_자동_가입한_신청자마다_JOIN_APPROVED_가_가고_거절은_JOIN_REJECTED_다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "noti-switch-leader@test.io");
    String 크루 = 크루를_만든다(크루장, "APPROVAL");
    TestAccount 첫째 = 가입한다(mockMvc, "noti-switch-first@test.io");
    TestAccount 둘째 = 가입한다(mockMvc, "noti-switch-second@test.io");
    신청한다(첫째, 크루).andExpect(status().isCreated());
    신청한다(둘째, 크루).andExpect(status().isCreated());

    mockMvc
        .perform(
            patch("/api/v1/crew")
                .header(인증, 크루장.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"joinPolicy\":\"OPEN\"}"))
        .andExpect(status().isOk());

    assertThat(종류(첫째)).containsExactly("JOIN_APPROVED");
    assertThat(종류(둘째)).containsExactly("JOIN_APPROVED");
    assertThat(대상(첫째, "JOIN_APPROVED")).isEqualTo("CREW:" + 크루);

    TestAccount 다른_크루장 = 가입한다(mockMvc, "noti-reject-leader@test.io");
    String 다른_크루 = 크루를_만든다(다른_크루장, "APPROVAL");
    TestAccount 거절될_사람 = 가입한다(mockMvc, "noti-rejected@test.io");
    String 신청 = 신청_id(신청한다(거절될_사람, 다른_크루).andExpect(status().isCreated()));
    mockMvc
        .perform(
            post("/api/v1/crew/join-requests/" + 신청)
                .header(인증, 다른_크루장.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"REJECT\"}"))
        .andExpect(status().isNoContent());
    assertThat(종류(거절될_사람)).containsExactly("JOIN_REJECTED");
  }

  @Test
  void 댓글은_글쓴이에게_한_건_가고_자기_글의_댓글이나_차단한_사람의_댓글은_알리지_않는다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("noti-comment-leader@test.io");
    TestAccount 글쓴이 = 크루원이_된다("noti-comment-author@test.io", 크루장);
    TestAccount 차단된_사람 = 크루원이_된다("noti-comment-blocked@test.io", 크루장);
    UUID 글 = 쓴다(글쓴이, "댓글 받을 글");

    댓글을_단다(크루장, 글);
    댓글을_단다(글쓴이, 글);
    mockMvc
        .perform(put("/api/v1/users/{userId}/block", 차단된_사람.id()).header(인증, 글쓴이.bearer()))
        .andExpect(status().isNoContent());
    댓글을_단다(차단된_사람, 글);

    assertThat(종류(글쓴이)).containsExactly("COMMENT");
    assertThat(대상(글쓴이, "COMMENT")).isEqualTo("POST:" + 글);
  }

  @Test
  void 공지는_쓴_사람을_뺀_크루원_모두에게_간다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("noti-notice-leader@test.io");
    TestAccount 크루원 = 크루원이_된다("noti-notice-member@test.io", 크루장);
    UUID 공지 = UUID.randomUUID();

    mockMvc
        .perform(
            post("/api/v1/crew/notices")
                .header(인증, 크루장.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of("id", 공지, "title", "9월 정기 활동", "body", "본문"))))
        .andExpect(status().isCreated());

    assertThat(종류(크루장)).isEmpty();
    assertThat(종류(크루원)).containsExactly("NOTICE");
    assertThat(대상(크루원, "NOTICE")).isEqualTo("NOTICE:" + 공지);
  }

  @Test
  void 신고는_크루장에게_REPORT_가_가고_삭제_처리는_신고자에게_결과를_글쓴이에게_삭제를_알린다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("noti-report-leader@test.io");
    TestAccount 글쓴이 = 크루원이_된다("noti-report-author@test.io", 크루장);
    TestAccount 신고자 = 크루원이_된다("noti-report-reporter@test.io", 크루장);
    UUID 글 = 쓴다(글쓴이, "신고될 글");
    UUID 신고 = UUID.randomUUID();

    mockMvc.perform(신고한다(신고자, 신고, 글)).andExpect(status().isCreated());
    assertThat(종류(크루장)).containsExactly("REPORT");
    assertThat(대상(크루장, "REPORT")).isEqualTo("REPORTS:" + 신고);
    assertThat(본문(mockMvc.perform(목록(크루장)).andExpect(status().isOk())).path("pending"))
        .hasToString("{\"joinRequests\":0,\"reports\":1}");

    mockMvc.perform(신고를_처리한다(크루장, 신고, "DELETE")).andExpect(status().isNoContent());

    assertThat(종류(신고자)).containsExactly("REPORT_RESOLVED");
    assertThat(대상(신고자, "REPORT_RESOLVED")).isEqualTo("NOTIFICATIONS:null");
    assertThat(종류(글쓴이)).containsExactly("POST_REMOVED");
    assertThat(대상(글쓴이, "POST_REMOVED")).isEqualTo("POST:null");
  }

  @Test
  void 크루장이_남의_글을_지우면_POST_REMOVED_가_가고_본인이_지우면_알림이_없다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("noti-remove-leader@test.io");
    TestAccount 글쓴이 = 크루원이_된다("noti-remove-author@test.io", 크루장);
    UUID 크루장이_지울_글 = 쓴다(글쓴이, "크루장이 지울 글");
    UUID 본인이_지울_글 = 쓴다(글쓴이, "본인이 지울 글");

    mockMvc.perform(글을_지운다(크루장, 크루장이_지울_글)).andExpect(status().isNoContent());
    mockMvc.perform(글을_지운다(글쓴이, 본인이_지울_글)).andExpect(status().isNoContent());

    assertThat(종류(글쓴이)).containsExactly("POST_REMOVED");
    assertThat(종류(크루장)).isEmpty();
  }

  @Test
  void 같은_글을_다른_트랜잭션이_먼저_지우고_있으면_크루장의_삭제는_알림을_내지_않는다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("noti-remove-race-leader@test.io");
    TestAccount 글쓴이 = 크루원이_된다("noti-remove-race-author@test.io", 크루장);
    UUID 글 = 쓴다(글쓴이, "두 길로 지워질 글");

    다른_트랜잭션이_잡은_채로(
            "UPDATE posts SET deleted_at = now(), deleted_by = '%s' WHERE id = ?"
                .formatted(크루장.id()),
            글,
            글을_지운다(크루장, 글))
        .andExpect(status().isNoContent());

    assertThat(종류(글쓴이)).isEmpty();
  }

  @Test
  void 팔로우한_크루원이_활동을_시작하면_알리고_설정을_끄면_알리지_않는다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("noti-follow-leader@test.io");
    TestAccount 팔로워 = 크루원이_된다("noti-follow-follower@test.io", 크루장);
    TestAccount 끈_팔로워 = 크루원이_된다("noti-follow-muted@test.io", 크루장);
    TestAccount 팔로우_안_한_사람 = 크루원이_된다("noti-follow-none@test.io", 크루장);
    mockMvc.perform(팔로우(팔로워, 크루장.id())).andExpect(status().isNoContent());
    mockMvc.perform(팔로우(팔로워, 크루장.id())).andExpect(status().isNoContent());
    mockMvc.perform(팔로우(끈_팔로워, 크루장.id())).andExpect(status().isNoContent());
    mockMvc
        .perform(
            patch("/api/v1/users/me")
                .header(인증, 끈_팔로워.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"notifyActivityStart\":false}"))
        .andExpect(status().isOk());
    UUID 활동 = UUID.randomUUID();

    mockMvc.perform(활동을_시작한다(크루장, 활동)).andExpect(status().isCreated());

    assertThat(종류(팔로워)).containsExactly("ACTIVITY_STARTED");
    assertThat(대상(팔로워, "ACTIVITY_STARTED")).isEqualTo("LIVE:" + 활동);
    assertThat(종류(끈_팔로워)).isEmpty();
    assertThat(종류(팔로우_안_한_사람)).isEmpty();

    mockMvc
        .perform(delete("/api/v1/users/{userId}/follow", 크루장.id()).header(인증, 팔로워.bearer()))
        .andExpect(status().isNoContent());
    assertThat(팔로우_수(팔로워)).isZero();
  }

  @Test
  void 자기_자신이나_다른_크루_사용자나_없는_사용자를_팔로우해도_204_이고_행은_생기지_않는다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("noti-follow-odd-leader@test.io");
    TestAccount 남의_크루장 = 크루장이_된다("noti-follow-odd-stranger@test.io");

    mockMvc.perform(팔로우(크루장, 크루장.id())).andExpect(status().isNoContent());
    mockMvc.perform(팔로우(크루장, 남의_크루장.id())).andExpect(status().isNoContent());
    mockMvc.perform(팔로우(크루장, UUID.randomUUID())).andExpect(status().isNoContent());

    assertThat(팔로우_수(크루장)).isZero();
  }

  @Test
  void 읽음_처리하면_미읽음_수가_줄고_ids_가_없으면_전부_읽는다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("noti-read-leader@test.io");
    TestAccount 크루원 = 크루원이_된다("noti-read-member@test.io", 크루장);
    UUID 글 = 쓴다(크루원, "댓글 받을 글");
    댓글을_단다(크루장, 글);
    댓글을_단다(크루장, 글);
    댓글을_단다(크루장, 글);
    List<Long> ids = new ArrayList<>();
    본문(mockMvc.perform(목록(크루원)).andExpect(status().isOk()))
        .path("items")
        .forEach(item -> ids.add(item.path("id").asLong()));
    assertThat(미읽음_수(크루원)).isEqualTo(3);

    mockMvc
        .perform(읽는다(크루원, "{\"ids\":[%d]}".formatted(ids.getFirst())))
        .andExpect(status().isNoContent());
    mockMvc
        .perform(읽는다(크루장, "{\"ids\":[%d]}".formatted(ids.get(1))))
        .andExpect(status().isNoContent());
    assertThat(미읽음_수(크루원)).isEqualTo(2);

    mockMvc
        .perform(post("/api/v1/notifications/read").header(인증, 크루원.bearer()))
        .andExpect(status().isNoContent());
    assertThat(미읽음_수(크루원)).isZero();
  }

  @Test
  void 목록은_최근_것부터_커서로_이어지고_크루원의_pending_은_0_이며_미가입자는_403_이다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("noti-page-leader@test.io");
    TestAccount 크루원 = 크루원이_된다("noti-page-member@test.io", 크루장);
    UUID 글 = 쓴다(크루원, "댓글 받을 글");
    댓글을_단다(크루장, 글);
    댓글을_단다(크루장, 글);

    JsonNode 첫_장 = 본문(mockMvc.perform(목록(크루원).param("limit", "1")).andExpect(status().isOk()));
    JsonNode 둘째_장 =
        본문(
            mockMvc
                .perform(
                    목록(크루원).param("limit", "1").param("cursor", 첫_장.path("nextCursor").asText()))
                .andExpect(status().isOk()));

    assertThat(첫_장.path("items").get(0).path("id").asLong())
        .isGreaterThan(둘째_장.path("items").get(0).path("id").asLong());
    assertThat(둘째_장.path("nextCursor").isNull()).isTrue();
    assertThat(첫_장.path("pending")).hasToString("{\"joinRequests\":0,\"reports\":0}");

    TestAccount 미가입자 = 가입한다(mockMvc, "noti-page-none@test.io");
    mockMvc
        .perform(목록(미가입자))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("NO_CREW"));
  }

  @Test
  void FCM_자격이_없어도_알림은_저장한다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("noti-fcm-off-leader@test.io");
    TestAccount 크루원 = 크루원이_된다("noti-fcm-off-member@test.io", 크루장);
    기기를_등록한다(크루원, "token-fcm-off");
    UUID 글 = 쓴다(크루원, "댓글 받을 글");

    댓글을_단다(크루장, 글);

    assertThat(fcmClient.enabled()).isFalse();
    assertThat(종류(크루원)).containsExactly("COMMENT");
  }

  @Test
  void 같은_id_로_댓글을_다시_보내도_알림은_한_건이다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("noti-resend-leader@test.io");
    TestAccount 글쓴이 = 크루원이_된다("noti-resend-author@test.io", 크루장);
    UUID 글 = 쓴다(글쓴이, "댓글 받을 글");
    UUID 댓글 = UUID.randomUUID();

    mockMvc.perform(댓글_요청(크루장, 글, 댓글)).andExpect(status().isCreated());
    mockMvc.perform(댓글_요청(크루장, 글, 댓글)).andExpect(status().is2xxSuccessful());

    assertThat(종류(글쓴이)).containsExactly("COMMENT");
  }

  @Test
  void 크루장이_직접_승인하면_신청자에게_JOIN_APPROVED_가_간다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "noti-approve-leader@test.io");
    String 크루 = 크루를_만든다(크루장, "APPROVAL");
    TestAccount 신청자 = 가입한다(mockMvc, "noti-approve-applicant@test.io");
    String 신청 = 신청_id(신청한다(신청자, 크루).andExpect(status().isCreated()));

    mockMvc
        .perform(
            post("/api/v1/crew/join-requests/" + 신청)
                .header(인증, 크루장.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"APPROVE\"}"))
        .andExpect(status().isNoContent());

    assertThat(종류(신청자)).containsExactly("JOIN_APPROVED");
  }

  @Test
  void 기각과_추방도_신고자에게_결과를_글로_알린다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("noti-resolve-leader@test.io");
    TestAccount 글쓴이 = 크루원이_된다("noti-resolve-author@test.io", 크루장);
    TestAccount 기각_신고자 = 크루원이_된다("noti-resolve-dismiss@test.io", 크루장);
    TestAccount 추방_신고자 = 크루원이_된다("noti-resolve-expel@test.io", 크루장);
    UUID 기각될_신고 = UUID.randomUUID();
    mockMvc.perform(신고한다(기각_신고자, 기각될_신고, 쓴다(글쓴이, "괜찮은 글"))).andExpect(status().isCreated());
    mockMvc
        .perform(
            post("/api/v1/reports")
                .header(인증, 추방_신고자.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of(
                            "id",
                            UUID.randomUUID(),
                            "targetType",
                            "USER",
                            "targetId",
                            글쓴이.id(),
                            "reason",
                            "SPAM"))))
        .andExpect(status().isCreated());

    mockMvc.perform(신고를_처리한다(크루장, 기각될_신고, "DISMISS")).andExpect(status().isNoContent());
    mockMvc
        .perform(delete("/api/v1/crew/members/{userId}", 글쓴이.id()).header(인증, 크루장.bearer()))
        .andExpect(status().isNoContent());

    assertThat(상세(기각_신고자, "REPORT_RESOLVED")).isEqualTo("신고한 내용을 검토했지만 조치하지 않았어요");
    assertThat(상세(추방_신고자, "REPORT_RESOLVED")).isEqualTo("신고한 크루원을 크루에서 내보냈어요");
    assertThat(종류(글쓴이)).doesNotContain("POST_REMOVED");
  }

  @Test
  void 팔로워가_차단했거나_크루를_옮겼거나_탈퇴했으면_활동_시작을_알리지_않는다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("noti-follow-skip-leader@test.io");
    TestAccount 차단한_팔로워 = 크루원이_된다("noti-follow-skip-blocker@test.io", 크루장);
    TestAccount 옮긴_팔로워 = 크루원이_된다("noti-follow-skip-mover@test.io", 크루장);
    TestAccount 탈퇴한_팔로워 = 크루원이_된다("noti-follow-skip-withdrawn@test.io", 크루장);
    TestAccount 남의_크루장 = 크루장이_된다("noti-follow-skip-other@test.io");
    TestAccount 받을_팔로워 = 크루원이_된다("noti-follow-skip-receiver@test.io", 크루장);
    for (TestAccount 팔로워 : List.of(차단한_팔로워, 옮긴_팔로워, 탈퇴한_팔로워, 받을_팔로워)) {
      mockMvc.perform(팔로우(팔로워, 크루장.id())).andExpect(status().isNoContent());
    }
    mockMvc
        .perform(put("/api/v1/users/{userId}/block", 크루장.id()).header(인증, 차단한_팔로워.bearer()))
        .andExpect(status().isNoContent());
    jdbcTemplate.update(
        "UPDATE crew_members SET crew_id = (SELECT crew_id FROM crew_members WHERE user_id = ?)"
            + " WHERE user_id = ?",
        남의_크루장.id(),
        옮긴_팔로워.id());
    jdbcTemplate.update("UPDATE users SET status = 'DELETED' WHERE id = ?", 탈퇴한_팔로워.id());

    mockMvc.perform(활동을_시작한다(크루장, UUID.randomUUID())).andExpect(status().isCreated());

    assertThat(종류(받을_팔로워)).containsExactly("ACTIVITY_STARTED");
    assertThat(종류(차단한_팔로워)).isEmpty();
    assertThat(종류(옮긴_팔로워)).isEmpty();
    assertThat(종류(탈퇴한_팔로워)).isEmpty();
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

  private List<String> 종류(TestAccount 계정) {
    return jdbcTemplate.queryForList(
        "SELECT type FROM notifications WHERE user_id = ? ORDER BY id", String.class, 계정.id());
  }

  private String 대상(TestAccount 계정, String 종류) {
    return jdbcTemplate.queryForObject(
        "SELECT target_type || ':' || coalesce(target_id, 'null') FROM notifications"
            + " WHERE user_id = ? AND type = ?",
        String.class,
        계정.id(),
        종류);
  }

  private String 상세(TestAccount 계정, String 종류) {
    return jdbcTemplate.queryForObject(
        "SELECT detail FROM notifications WHERE user_id = ? AND type = ?",
        String.class,
        계정.id(),
        종류);
  }

  private long 팔로우_수(TestAccount 계정) {
    return jdbcTemplate.queryForObject(
        "SELECT count(*) FROM follows WHERE follower_id = ?", Long.class, 계정.id());
  }

  private long 미읽음_수(TestAccount 계정) throws Exception {
    return 본문(mockMvc
            .perform(get("/api/v1/notifications/unread-count").header(인증, 계정.bearer()))
            .andExpect(status().isOk()))
        .path("count")
        .asLong();
  }

  private String 크루를_만든다(TestAccount 계정, String 가입_방식) throws Exception {
    return 본문(mockMvc
            .perform(
                post("/api/v1/crews")
                    .header(인증, 계정.bearer())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        "{\"name\":\"크루%s\",\"region\":\"SEOUL\",\"joinPolicy\":\"%s\"}"
                            .formatted(UUID.randomUUID().toString().substring(0, 8), 가입_방식)))
            .andExpect(status().isCreated()))
        .path("id")
        .asText();
  }

  private TestAccount 크루장이_된다(String 이메일) throws Exception {
    TestAccount 계정 = 가입한다(mockMvc, 이메일);
    크루를_만든다(계정, "OPEN");
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

  private ResultActions 신청한다(TestAccount 계정, String 크루) throws Exception {
    return mockMvc.perform(
        post("/api/v1/crews/join-requests")
            .header(인증, 계정.bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"crewId\":\"%s\"}".formatted(크루)));
  }

  private String 신청_id(ResultActions 결과) throws Exception {
    return 본문(결과).path("id").asText();
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

  private void 댓글을_단다(TestAccount 계정, UUID 글) throws Exception {
    mockMvc.perform(댓글_요청(계정, 글, UUID.randomUUID())).andExpect(status().isCreated());
  }

  private MockHttpServletRequestBuilder 댓글_요청(TestAccount 계정, UUID 글, UUID 댓글) throws Exception {
    return post("/api/v1/posts/{postId}/comments", 글)
        .header(인증, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(Map.of("id", 댓글, "text", "댓글")));
  }

  private void 기기를_등록한다(TestAccount 계정, String 토큰) throws Exception {
    mockMvc
        .perform(
            put("/api/v1/users/me/devices")
                .header(인증, 계정.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"pushToken\":\"%s\",\"platform\":\"ANDROID\"}".formatted(토큰)))
        .andExpect(status().isNoContent());
  }

  private MockHttpServletRequestBuilder 신고한다(TestAccount 계정, UUID id, UUID 글) throws Exception {
    return post("/api/v1/reports")
        .header(인증, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content(
            objectMapper.writeValueAsString(
                Map.of("id", id, "targetType", "POST", "targetId", 글, "reason", "SPAM")));
  }

  private static MockHttpServletRequestBuilder 신고를_처리한다(TestAccount 계정, UUID 신고, String 결과) {
    return post("/api/v1/crew/reports/{reportId}", 신고)
        .header(인증, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"result\":\"%s\"}".formatted(결과));
  }

  private static MockHttpServletRequestBuilder 글을_지운다(TestAccount 계정, UUID 글) {
    return delete("/api/v1/posts/{postId}", 글).header(인증, 계정.bearer());
  }

  private static MockHttpServletRequestBuilder 팔로우(TestAccount 계정, UUID 대상) {
    return put("/api/v1/users/{userId}/follow", 대상).header(인증, 계정.bearer());
  }

  private static MockHttpServletRequestBuilder 활동을_시작한다(TestAccount 계정, UUID 활동) {
    return post("/api/v1/activities")
        .header(인증, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content(
            "{\"id\":\"%s\",\"startedAt\":\"2026-10-13T09:00:00Z\",\"locationShared\":true}"
                .formatted(활동));
  }

  private static MockHttpServletRequestBuilder 목록(TestAccount 계정) {
    return get("/api/v1/notifications").header(인증, 계정.bearer());
  }

  private static MockHttpServletRequestBuilder 읽는다(TestAccount 계정, String 본문) {
    return post("/api/v1/notifications/read")
        .header(인증, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content(본문);
  }

  private JsonNode 본문(ResultActions 결과) throws Exception {
    return objectMapper.readTree(결과.andReturn().getResponse().getContentAsString()).path("data");
  }
}
