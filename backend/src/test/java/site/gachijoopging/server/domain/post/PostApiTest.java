package site.gachijoopging.server.domain.post;

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
import java.nio.file.Files;
import java.nio.file.Path;
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
class PostApiTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private DataSource dataSource;

  @Value("${app.media.root}")
  private String 업로드_루트;

  @Test
  void 나만_보기_글은_남에게_안_보이고_내_게시물_탭에만_있다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("post-private-leader@test.io");
    TestAccount 나 = 크루원이_된다("post-private-me@test.io", 크루장);
    UUID 공개 = 쓴다(나, "다 같이 봐요", "CREW");
    UUID 비공개 = 쓴다(나, "나만 봐요", "PRIVATE");

    assertThat(피드_id(나, "CREW")).contains(공개.toString()).doesNotContain(비공개.toString());
    assertThat(피드_id(나, "MINE")).contains(공개.toString(), 비공개.toString());
    assertThat(피드_id(크루장, "CREW")).contains(공개.toString()).doesNotContain(비공개.toString());
    assertThat(피드_id(크루장, "MINE")).doesNotContain(공개.toString(), 비공개.toString());

    상세(나, 비공개).andExpect(status().isOk()).andExpect(jsonPath("$.data.visibility").value("PRIVATE"));
    상세(크루장, 비공개).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
  }

  @Test
  void 크루원_게시물_목록은_본인이면_나만_보기를_포함한다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("post-member-leader@test.io");
    TestAccount 나 = 크루원이_된다("post-member-me@test.io", 크루장);
    UUID 공개 = 쓴다(나, "공개", "CREW");
    UUID 비공개 = 쓴다(나, "비공개", "PRIVATE");
    쓴다(크루장, "크루장 글", "CREW");

    assertThat(ids(크루원_게시물(나, 나.id()))).containsExactly(비공개.toString(), 공개.toString());
    assertThat(ids(크루원_게시물(크루장, 나.id()))).containsExactly(공개.toString());

    TestAccount 남 = 크루를_만든다("post-member-stranger@test.io");
    mockMvc
        .perform(
            get("/api/v1/crew/members/{userId}/posts", 남.id())
                .header(HttpHeaders.AUTHORIZATION, 나.bearer()))
        .andExpect(status().isNotFound());
  }

  @Test
  void 좋아요는_두_번_눌러도_한_건이고_취소하면_빠진다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("post-like-leader@test.io");
    TestAccount 나 = 크루원이_된다("post-like-me@test.io", 크루장);
    UUID 글 = 쓴다(크루장, "좋아요 눌러 주세요", "CREW");

    mockMvc.perform(좋아요(나, 글)).andExpect(status().isNoContent());
    mockMvc.perform(좋아요(나, 글)).andExpect(status().isNoContent());
    상세(나, 글)
        .andExpect(jsonPath("$.data.likeCount").value(1))
        .andExpect(jsonPath("$.data.liked").value(true));
    상세(크루장, 글).andExpect(jsonPath("$.data.liked").value(false));

    mockMvc
        .perform(
            delete("/api/v1/posts/{postId}/like", 글).header(HttpHeaders.AUTHORIZATION, 나.bearer()))
        .andExpect(status().isNoContent());
    상세(나, 글)
        .andExpect(jsonPath("$.data.likeCount").value(0))
        .andExpect(jsonPath("$.data.liked").value(false));
  }

  @Test
  void 크루장이_남의_글을_지우면_deleted_by_에_남고_크루원은_남의_글을_못_지운다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("post-del-leader@test.io");
    TestAccount 나 = 크루원이_된다("post-del-me@test.io", 크루장);
    TestAccount 옆 = 크루원이_된다("post-del-other@test.io", 크루장);
    UUID 내_글 = 쓴다(나, "지워질 글", "CREW");
    UUID 내가_지울_글 = 쓴다(나, "내가 지울 글", "CREW");

    mockMvc.perform(지운다(옆, 내_글)).andExpect(status().isForbidden());

    mockMvc.perform(지운다(크루장, 내_글)).andExpect(status().isNoContent());
    mockMvc.perform(지운다(나, 내가_지울_글)).andExpect(status().isNoContent());

    assertThat(지운_사람(내_글)).isEqualTo(크루장.id());
    assertThat(지운_사람(내가_지울_글)).isNull();
    상세(나, 내_글).andExpect(status().isNotFound());
    assertThat(피드_id(나, "MINE")).doesNotContain(내_글.toString(), 내가_지울_글.toString());
  }

  @Test
  void 차단한_사람의_글은_목록에서_빠지고_상세는_404_다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("post-block-leader@test.io");
    TestAccount 나 = 크루원이_된다("post-block-me@test.io", 크루장);
    UUID 크루장_글 = 쓴다(크루장, "차단당할 글", "CREW");
    jdbcTemplate.update(
        "INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?)", 나.id(), 크루장.id());

    assertThat(피드_id(나, "CREW")).doesNotContain(크루장_글.toString());
    상세(나, 크루장_글).andExpect(status().isNotFound());
    mockMvc.perform(좋아요(나, 크루장_글)).andExpect(status().isNotFound());
    assertThat(피드_id(크루장, "CREW")).contains(크루장_글.toString());
  }

  @Test
  void 다른_크루의_글은_403_이_아니라_404_다() throws Exception {
    TestAccount 우리_크루장 = 크루를_만든다("post-other-ours@test.io");
    TestAccount 남의_크루장 = 크루를_만든다("post-other-theirs@test.io");
    UUID 남의_글 = 쓴다(남의_크루장, "남의 크루 글", "CREW");

    상세(우리_크루장, 남의_글).andExpect(status().isNotFound());
    mockMvc.perform(좋아요(우리_크루장, 남의_글)).andExpect(status().isNotFound());
    mockMvc.perform(지운다(우리_크루장, 남의_글)).andExpect(status().isNotFound());
    assertThat(피드_id(우리_크루장, "CREW")).doesNotContain(남의_글.toString());
  }

  @Test
  void 사진을_붙여_쓰면_순서대로_오고_지우면_커밋_뒤_원본과_썸네일이_격리된다() throws Exception {
    TestAccount 나 = 크루를_만든다("post-photo@test.io");
    String 첫_원본 = "2026/10/" + UUID.randomUUID() + "-a.jpg";
    String 둘째_원본 = "2026/10/" + UUID.randomUUID() + "-b.jpg";
    UUID 첫_사진 = 사진을_올린다(나, 첫_원본);
    UUID 둘째_사진 = 사진을_올린다(나, 둘째_원본);

    JsonNode 글 =
        본문(
            mockMvc
                .perform(작성(나, UUID.randomUUID(), "", "CREW", List.of(둘째_사진, 첫_사진)))
                .andExpect(status().isCreated()));
    assertThat(글.path("media")).hasSize(2);
    assertThat(글.path("media").get(0).path("url").asText()).contains(둘째_원본);
    assertThat(글.path("media").get(1).path("thumbUrl").asText()).contains(썸네일(첫_원본));

    mockMvc
        .perform(작성(나, UUID.randomUUID(), "같은 사진 또", "CREW", List.of(첫_사진)))
        .andExpect(status().isConflict());

    mockMvc
        .perform(지운다(나, UUID.fromString(글.path("id").asText())))
        .andExpect(status().isNoContent());

    for (String 원본 : List.of(첫_원본, 둘째_원본)) {
      assertThat(Path.of(업로드_루트, 원본)).doesNotExist();
      assertThat(Path.of(업로드_루트, 썸네일(원본))).doesNotExist();
      assertThat(Path.of(업로드_루트, "deleted", 원본)).exists();
      assertThat(Path.of(업로드_루트, "deleted", 썸네일(원본))).exists();
    }
  }

  @Test
  void 추방이_커밋되기를_기다린_작성은_옛_크루에_남지_않는다() throws Exception {
    TestAccount 크루장 = 크루를_만든다("post-expel-race-leader@test.io");
    TestAccount 나 = 크루원이_된다("post-expel-race-me@test.io", 크루장);
    UUID id = UUID.randomUUID();

    try (Connection 추방 = dataSource.getConnection()) {
      추방.setAutoCommit(false);
      try (PreparedStatement 지우기 =
          추방.prepareStatement("DELETE FROM crew_members WHERE user_id = ?")) {
        지우기.setObject(1, 나.id());
        지우기.executeUpdate();
      }
      CompletableFuture<ResultActions> 작성_결과 =
          CompletableFuture.supplyAsync(
              () -> {
                try {
                  return mockMvc.perform(작성(나, id, "늦은 글", "CREW", List.of()));
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
      추방.commit();

      작성_결과
          .get(10, TimeUnit.SECONDS)
          .andExpect(status().isForbidden())
          .andExpect(jsonPath("$.code").value("NO_CREW"));
    }
    assertThat(
            jdbcTemplate.queryForObject("SELECT count(*) FROM posts WHERE id = ?", Long.class, id))
        .isZero();
  }

  @Test
  void 같은_id_로_다시_보내면_한_건만_생긴다() throws Exception {
    TestAccount 나 = 크루를_만든다("post-retry@test.io");
    UUID id = UUID.randomUUID();

    mockMvc.perform(작성(나, id, "한 번만", "CREW", List.of())).andExpect(status().isCreated());
    mockMvc
        .perform(작성(나, id, "한 번만", "CREW", List.of()))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.id").value(id.toString()));

    assertThat(
            jdbcTemplate.queryForObject("SELECT count(*) FROM posts WHERE id = ?", Long.class, id))
        .isEqualTo(1);
  }

  @Test
  void 글도_사진도_없거나_천_자를_넘거나_남의_사진이면_422_다() throws Exception {
    TestAccount 나 = 크루를_만든다("post-invalid@test.io");
    TestAccount 남 = 크루를_만든다("post-invalid-other@test.io");
    UUID 남의_사진 = 사진을_올린다(남, "2026/10/" + UUID.randomUUID() + "-x.jpg");

    mockMvc
        .perform(작성(나, UUID.randomUUID(), "  ", "CREW", List.of()))
        .andExpect(status().isUnprocessableEntity());
    mockMvc
        .perform(작성(나, UUID.randomUUID(), "가".repeat(1001), "CREW", List.of()))
        .andExpect(status().isUnprocessableEntity());
    mockMvc
        .perform(작성(나, UUID.randomUUID(), "😀".repeat(1000), "CREW", List.of()))
        .andExpect(status().isCreated());
    mockMvc
        .perform(작성(나, UUID.randomUUID(), "남의 사진", "CREW", List.of(남의_사진)))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void 기간과_커서로_나눠_받는다() throws Exception {
    TestAccount 나 = 크루를_만든다("post-page@test.io");
    UUID 옛_글 = 쓴다(나, "9월 글", "CREW");
    jdbcTemplate.update(
        "UPDATE posts SET created_at = '2026-09-01T15:30:00Z' WHERE id = ?",
        옛_글); // KST 9월 2일 0시 30분
    List<String> 새_글 = new ArrayList<>();
    for (int i = 0; i < 3; i++) {
      UUID 글 = 쓴다(나, "새 글 " + i, "CREW");
      jdbcTemplate.update(
          "UPDATE posts SET created_at = ? WHERE id = ?",
          Timestamp.from(Instant.parse("2026-10-0%dT00:00:00Z".formatted(i + 1))),
          글);
      새_글.add(0, 글.toString());
    }

    JsonNode 첫_장 = 본문(mockMvc.perform(피드(나, "CREW").param("limit", "2")));
    assertThat(ids(첫_장)).containsExactlyElementsOf(새_글.subList(0, 2));
    JsonNode 둘째_장 =
        본문(
            mockMvc.perform(
                피드(나, "CREW")
                    .param("limit", "2")
                    .param("cursor", 첫_장.path("nextCursor").asText())));
    assertThat(ids(둘째_장)).containsExactly(새_글.get(2), 옛_글.toString());
    assertThat(둘째_장.path("nextCursor").isNull()).isTrue();

    assertThat(
            ids(
                본문(
                    mockMvc.perform(
                        피드(나, "CREW").param("from", "2026-09-02").param("to", "2026-09-02")))))
        .containsExactly(옛_글.toString());
    assertThat(
            ids(
                본문(
                    mockMvc.perform(
                        피드(나, "CREW").param("from", "2026-09-01").param("to", "2026-09-01")))))
        .isEmpty();
    mockMvc
        .perform(피드(나, "CREW").param("from", "2026-09-03").param("to", "2026-09-02"))
        .andExpect(status().isUnprocessableEntity());
    mockMvc
        .perform(피드(나, "CREW").param("from", "2026-09-03"))
        .andExpect(status().isUnprocessableEntity());
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

  private UUID 사진을_올린다(TestAccount 주인, String 원본) throws Exception {
    UUID 미디어 = UUID.randomUUID();
    for (String 키 : List.of(원본, 썸네일(원본))) {
      Path 파일 = Path.of(업로드_루트, 키);
      Files.createDirectories(파일.getParent());
      Files.write(파일, new byte[] {1});
    }
    jdbcTemplate.update(
        "INSERT INTO media (id, owner_id, purpose, object_key, thumb_key) VALUES (?, ?, 'POST', ?, ?)",
        미디어,
        주인.id(),
        원본,
        썸네일(원본));
    return 미디어;
  }

  private static String 썸네일(String 원본) {
    return 원본.replace(".jpg", "_thumb.jpg");
  }

  private UUID 쓴다(TestAccount 계정, String 글, String 공개) throws Exception {
    UUID id = UUID.randomUUID();
    mockMvc.perform(작성(계정, id, 글, 공개, List.of())).andExpect(status().isCreated());
    return id;
  }

  private MockHttpServletRequestBuilder 작성(
      TestAccount 계정, UUID id, String 글, String 공개, List<UUID> 사진) throws Exception {
    return post("/api/v1/crew/posts")
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content(
            objectMapper.writeValueAsString(
                Map.of("id", id, "text", 글, "visibility", 공개, "mediaIds", 사진)));
  }

  private static MockHttpServletRequestBuilder 피드(TestAccount 계정, String 범위) {
    return get("/api/v1/crew/posts")
        .param("scope", 범위)
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private List<String> 피드_id(TestAccount 계정, String 범위) throws Exception {
    return ids(본문(mockMvc.perform(피드(계정, 범위)).andExpect(status().isOk())));
  }

  private JsonNode 크루원_게시물(TestAccount 계정, UUID 대상) throws Exception {
    return 본문(
        mockMvc
            .perform(
                get("/api/v1/crew/members/{userId}/posts", 대상)
                    .header(HttpHeaders.AUTHORIZATION, 계정.bearer()))
            .andExpect(status().isOk()));
  }

  private ResultActions 상세(TestAccount 계정, UUID 글) throws Exception {
    return mockMvc.perform(
        get("/api/v1/posts/{postId}", 글).header(HttpHeaders.AUTHORIZATION, 계정.bearer()));
  }

  private static MockHttpServletRequestBuilder 좋아요(TestAccount 계정, UUID 글) {
    return put("/api/v1/posts/{postId}/like", 글).header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private static MockHttpServletRequestBuilder 지운다(TestAccount 계정, UUID 글) {
    return delete("/api/v1/posts/{postId}", 글).header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private UUID 지운_사람(UUID 글) {
    return jdbcTemplate.queryForObject("SELECT deleted_by FROM posts WHERE id = ?", UUID.class, 글);
  }

  private JsonNode 본문(ResultActions 결과) throws Exception {
    return objectMapper.readTree(결과.andReturn().getResponse().getContentAsString()).path("data");
  }

  private static List<String> ids(JsonNode 페이지) {
    List<String> ids = new ArrayList<>();
    페이지.path("items").forEach(글 -> ids.add(글.path("id").asText()));
    return ids;
  }
}
