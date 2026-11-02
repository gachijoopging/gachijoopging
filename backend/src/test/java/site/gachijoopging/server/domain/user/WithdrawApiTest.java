package site.gachijoopging.server.domain.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionTemplate;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.lock.UserLock;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts.TestAccount;

@AutoConfigureMockMvc
class WithdrawApiTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private TransactionTemplate transactionTemplate;
  @Autowired private UserLock userLock;

  @Value("${app.media.root}")
  private Path 업로드_루트;

  @Test
  void 크루원이_탈퇴하면_개인정보와_활동이_지워지고_크루_합산과_게시물_사진은_남는다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "withdraw-member-leader@test.io");
    String 크루 = 크루를_만든다(크루장, "OPEN");
    Map<String, String> 토큰 = 가입_토큰(mockMvc, "withdraw-member@test.io");
    TestAccount 나 =
        new TestAccount(UUID.fromString(내_id(mockMvc, 토큰.get("access"))), 토큰.get("access"));
    들어간다(나, 크루);
    UUID 활동 = 끝난_활동을_넣는다(나, 크루);
    사진 활동_사진 = 사진을_넣는다(나, "ACTIVITY");
    jdbcTemplate.update(
        "INSERT INTO activity_photos (id, activity_id, media_id, taken_at, inference_status,"
            + " order_index) VALUES (?, ?, ?, now(), 'OK', 0)",
        UUID.randomUUID(),
        활동,
        활동_사진.id());
    사진 프로필_사진 = 사진을_넣는다(나, "PROFILE");
    jdbcTemplate.update("UPDATE users SET photo_media_id = ? WHERE id = ?", 프로필_사진.id(), 나.id());
    사진 게시물_사진 = 사진을_넣는다(나, "POST");
    jdbcTemplate.update(
        "INSERT INTO crew_daily_stats (crew_id, date, item_count, distance_m, duration_sec,"
            + " activity_count) VALUES (?, current_date, 5, 100, 600, 1)",
        UUID.fromString(크루));
    jdbcTemplate.update(
        "INSERT INTO follows (follower_id, followee_id) VALUES (?, ?), (?, ?)",
        나.id(),
        크루장.id(),
        크루장.id(),
        나.id());
    jdbcTemplate.update(
        "INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?), (?, ?)",
        나.id(),
        크루장.id(),
        크루장.id(),
        나.id());
    jdbcTemplate.update(
        "INSERT INTO notifications (user_id, type, title) VALUES (?, 'NOTICE', '공지')", 나.id());
    jdbcTemplate.update(
        "INSERT INTO devices (push_token, user_id, platform, updated_at) VALUES (?, ?, 'ANDROID',"
            + " now())",
        "push-" + 나.id(),
        나.id());
    jdbcTemplate.update(
        "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, 'h',"
            + " now() + interval '10 minutes')",
        나.id());

    mockMvc.perform(탈퇴한다(나)).andExpect(status().isNoContent());

    Map<String, Object> 행 =
        jdbcTemplate.queryForMap(
            "SELECT status, email, password_hash, nickname, photo_media_id, deleted_at"
                + " FROM users WHERE id = ?",
            나.id());
    assertThat(행.get("status")).isEqualTo("DELETED");
    assertThat(행.get("deleted_at")).isNotNull();
    assertThat(행)
        .containsEntry("email", null)
        .containsEntry("password_hash", null)
        .containsEntry("nickname", null)
        .containsEntry("photo_media_id", null);
    assertThat(개수("SELECT count(*) FROM activities WHERE user_id = ?", 나.id())).isZero();
    assertThat(개수("SELECT count(*) FROM crew_members WHERE user_id = ?", 나.id())).isZero();
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT item_count FROM crew_daily_stats WHERE crew_id = ? AND date = current_date",
                Integer.class,
                UUID.fromString(크루)))
        .isEqualTo(5);
    for (String 표 :
        new String[] {
          "SELECT count(*) FROM refresh_tokens WHERE user_id = ?",
          "SELECT count(*) FROM devices WHERE user_id = ?",
          "SELECT count(*) FROM password_reset_tokens WHERE user_id = ?",
          "SELECT count(*) FROM notifications WHERE user_id = ?",
        }) {
      assertThat(개수(표, 나.id())).as(표).isZero();
    }
    assertThat(
            개수(
                "SELECT count(*) FROM follows WHERE follower_id = ? OR followee_id = ?",
                나.id(),
                나.id()))
        .isZero();
    assertThat(
            개수(
                "SELECT count(*) FROM blocks WHERE blocker_id = ? OR blocked_id = ?",
                나.id(),
                나.id()))
        .isZero();
    assertThat(개수("SELECT count(*) FROM media WHERE owner_id = ?", 나.id())).isEqualTo(1);
    assertThat(파일(활동_사진.키())).doesNotExist();
    assertThat(파일(활동_사진.키() + "-t")).doesNotExist();
    assertThat(파일(프로필_사진.키())).doesNotExist();
    assertThat(파일(게시물_사진.키())).exists();

    mockMvc
        .perform(
            post("/api/v1/auth/refresh")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"%s\"}".formatted(토큰.get("refresh"))))
        .andExpect(status().isUnauthorized());
    mockMvc
        .perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, 나.bearer()))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void 잠금을_기다리던_요청은_탈퇴가_커밋된_뒤_진행하지_않는다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "withdraw-lock-waiter@test.io");

    mockMvc.perform(탈퇴한다(나)).andExpect(status().isNoContent());

    assertThatThrownBy(() -> transactionTemplate.executeWithoutResult(s -> userLock.lock(나.id())))
        .isInstanceOfSatisfying(
            BusinessException.class,
            e -> assertThat(e.errorCode()).isEqualTo(ErrorCode.INVALID_CREDENTIALS));
  }

  @Test
  void 직접_지워_격리된_활동_사진도_탈퇴하면_파일까지_지운다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "withdraw-quarantined@test.io");
    String 크루 = 크루를_만든다(나, "OPEN");
    UUID 활동 = 끝난_활동을_넣는다(나, 크루);
    사진 사진 = 사진을_넣는다(나, "ACTIVITY");
    jdbcTemplate.update(
        "INSERT INTO activity_photos (id, activity_id, media_id, taken_at, inference_status,"
            + " order_index) VALUES (?, ?, ?, now(), 'OK', 0)",
        UUID.randomUUID(),
        활동,
        사진.id());
    mockMvc
        .perform(
            delete("/api/v1/activities/{id}", 활동).header(HttpHeaders.AUTHORIZATION, 나.bearer()))
        .andExpect(status().isNoContent());
    assertThat(파일("deleted/" + 사진.키())).exists();

    mockMvc.perform(탈퇴한다(나)).andExpect(status().isNoContent());

    assertThat(개수("SELECT count(*) FROM activities WHERE user_id = ?", 나.id())).isZero();
    assertThat(파일("deleted/" + 사진.키())).doesNotExist();
    assertThat(파일("deleted/" + 사진.키() + "-t")).doesNotExist();
  }

  @Test
  void 다른_크루원이_있는_크루장은_403_LEADER_MUST_DELEGATE_이고_아무것도_안_바뀐다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "withdraw-busy-leader@test.io");
    String 크루 = 크루를_만든다(크루장, "OPEN");
    들어간다(가입한다(mockMvc, "withdraw-busy-member@test.io"), 크루);

    mockMvc
        .perform(탈퇴한다(크루장))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("LEADER_MUST_DELEGATE"));

    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT status FROM users WHERE id = ?", String.class, 크루장.id()))
        .isEqualTo("ACTIVE");
    assertThat(개수("SELECT count(*) FROM crew_members WHERE crew_id = ?", UUID.fromString(크루)))
        .isEqualTo(2);
  }

  @Test
  void 혼자_남은_크루장이_탈퇴하면_크루가_해산되고_그_크루의_대기_신청이_취소된다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "withdraw-solo-leader@test.io");
    String 크루 = 크루를_만든다(크루장, "APPROVAL");
    신청한다(가입한다(mockMvc, "withdraw-solo-applicant@test.io"), 크루);

    mockMvc.perform(탈퇴한다(크루장)).andExpect(status().isNoContent());

    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT deleted_at FROM crews WHERE id = ?", Timestamp.class, UUID.fromString(크루)))
        .isNotNull();
    assertThat(
            개수(
                "SELECT count(*) FROM crew_join_requests WHERE crew_id = ? AND status = 'PENDING'",
                UUID.fromString(크루)))
        .isZero();
  }

  @Test
  void 진행_중_활동이_있으면_409_CONFLICT_다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "withdraw-in-progress@test.io");
    String 크루 = 크루를_만든다(나, "OPEN");
    jdbcTemplate.update(
        "INSERT INTO activities (id, user_id, crew_id, status, started_at, location_shared)"
            + " VALUES (?, ?, ?, 'IN_PROGRESS', now(), false)",
        UUID.randomUUID(),
        나.id(),
        UUID.fromString(크루));

    mockMvc
        .perform(탈퇴한다(나))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONFLICT"));

    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT status FROM users WHERE id = ?", String.class, 나.id()))
        .isEqualTo("ACTIVE");
  }

  @Test
  void 승인_대기_중_탈퇴하면_신청이_취소되고_크루장_목록에서_빠지며_공개_전환해도_가입되지_않는다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "withdraw-pending-leader@test.io");
    String 크루 = 크루를_만든다(크루장, "APPROVAL");
    TestAccount 나 = 가입한다(mockMvc, "withdraw-pending@test.io");
    String 신청 = 신청한다(나, 크루);

    mockMvc.perform(탈퇴한다(나)).andExpect(status().isNoContent());

    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT status FROM crew_join_requests WHERE id = ?",
                String.class,
                UUID.fromString(신청)))
        .isEqualTo("CANCELED");
    mockMvc
        .perform(get("/api/v1/crew/join-requests").header(HttpHeaders.AUTHORIZATION, 크루장.bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items.length()").value(0));
    mockMvc
        .perform(
            patch("/api/v1/crew")
                .header(HttpHeaders.AUTHORIZATION, 크루장.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"region\":\"SEOUL\",\"joinPolicy\":\"OPEN\"}"))
        .andExpect(status().isOk());
    assertThat(개수("SELECT count(*) FROM crew_members WHERE user_id = ?", 나.id())).isZero();
  }

  @Test
  void 추방_이력과_확인하지_않은_거절_안내는_지우고_확인한_거절은_남긴다() throws Exception {
    TestAccount 추방한_크루장 = 가입한다(mockMvc, "withdraw-expel-leader@test.io");
    String 추방한_크루 = 크루를_만든다(추방한_크루장, "OPEN");
    TestAccount 거절한_크루장 = 가입한다(mockMvc, "withdraw-reject-leader@test.io");
    String 거절한_크루 = 크루를_만든다(거절한_크루장, "APPROVAL");
    TestAccount 나 = 가입한다(mockMvc, "withdraw-history@test.io");
    jdbcTemplate.update(
        "INSERT INTO crew_expulsions (crew_id, user_id, expelled_by, expelled_at)"
            + " VALUES (?, ?, ?, now())",
        UUID.fromString(추방한_크루),
        나.id(),
        추방한_크루장.id());
    UUID 미확인 = 거절을_넣는다(거절한_크루, 나, null);
    UUID 확인함 = 거절을_넣는다(거절한_크루, 나, Instant.now());

    mockMvc.perform(탈퇴한다(나)).andExpect(status().isNoContent());

    assertThat(개수("SELECT count(*) FROM crew_expulsions WHERE user_id = ?", 나.id())).isZero();
    assertThat(개수("SELECT count(*) FROM crew_join_requests WHERE id = ?", 미확인)).isZero();
    assertThat(개수("SELECT count(*) FROM crew_join_requests WHERE id = ?", 확인함)).isEqualTo(1);
  }

  private static Map<String, String> 가입_토큰(MockMvc mockMvc, String 이메일) throws Exception {
    String 응답 =
        mockMvc
            .perform(
                post("/api/v1/auth/signup")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(가입_본문(이메일)))
            .andReturn()
            .getResponse()
            .getContentAsString();
    return Map.of(
        "access", JsonPath.read(응답, "$.data.accessToken"),
        "refresh", JsonPath.read(응답, "$.data.refreshToken"));
  }

  private String 크루를_만든다(TestAccount 계정, String 가입_방식) throws Exception {
    return JsonPath.read(
        mockMvc
            .perform(
                post("/api/v1/crews")
                    .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        "{\"name\":\"%s\",\"region\":\"SEOUL\",\"joinPolicy\":\"%s\"}"
                            .formatted("w" + UUID.randomUUID().toString().substring(0, 8), 가입_방식)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString(),
        "$.data.id");
  }

  private String 신청한다(TestAccount 계정, String 크루) throws Exception {
    return JsonPath.read(
        mockMvc
            .perform(
                post("/api/v1/crews/join-requests")
                    .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"crewId\":\"%s\"}".formatted(크루)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString(),
        "$.data.id");
  }

  private void 들어간다(TestAccount 계정, String 크루) throws Exception {
    신청한다(계정, 크루);
  }

  private UUID 끝난_활동을_넣는다(TestAccount 계정, String 크루) {
    UUID id = UUID.randomUUID();
    jdbcTemplate.update(
        "INSERT INTO activities (id, user_id, crew_id, status, started_at, ended_at, distance_m,"
            + " location_shared, item_count) VALUES (?, ?, ?, 'ENDED', now() - interval '1 hour',"
            + " now(), 100, false, 5)",
        id,
        계정.id(),
        UUID.fromString(크루));
    return id;
  }

  /** 썸네일 키는 원본 키 + "-t" 다. */
  private record 사진(UUID id, String 키) {}

  private 사진 사진을_넣는다(TestAccount 주인, String 용도) throws Exception {
    UUID id = UUID.randomUUID();
    String 원본 = "withdraw/" + id;
    jdbcTemplate.update(
        "INSERT INTO media (id, owner_id, purpose, object_key, thumb_key) VALUES (?, ?, ?, ?, ?)",
        id,
        주인.id(),
        용도,
        원본,
        원본 + "-t");
    Files.createDirectories(파일(원본).getParent());
    Files.write(파일(원본), new byte[] {1});
    Files.write(파일(원본 + "-t"), new byte[] {1});
    return new 사진(id, 원본);
  }

  private UUID 거절을_넣는다(String 크루, TestAccount 계정, Instant 확인) {
    UUID id = UUID.randomUUID();
    jdbcTemplate.update(
        "INSERT INTO crew_join_requests (id, crew_id, user_id, status, created_at, decided_at,"
            + " rejection_read_at) VALUES (?, ?, ?, 'REJECTED', now(), now(), ?)",
        id,
        UUID.fromString(크루),
        계정.id(),
        확인 == null ? null : Timestamp.from(확인));
    return id;
  }

  private Path 파일(String 키) {
    return 업로드_루트.resolve(키);
  }

  private int 개수(String sql, Object... 인자) {
    return jdbcTemplate.queryForObject(sql, Integer.class, 인자);
  }

  private static MockHttpServletRequestBuilder 탈퇴한다(TestAccount 계정) {
    return delete("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }
}
