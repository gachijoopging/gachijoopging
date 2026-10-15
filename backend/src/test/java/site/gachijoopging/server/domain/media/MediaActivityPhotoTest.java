package site.gachijoopging.server.domain.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static site.gachijoopging.server.support.TestAccounts.가입한다;

import com.jayway.jsonpath.JsonPath;
import com.sun.net.httpserver.HttpServer;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import javax.imageio.ImageIO;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import site.gachijoopging.server.domain.media.client.AiProperties;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts.TestAccount;

@AutoConfigureMockMvc
@Import(MediaActivityPhotoTest.AI_스텁.class)
class MediaActivityPhotoTest extends IntegrationTest {

  private static final AtomicInteger AI_호출 = new AtomicInteger();
  private static volatile boolean AI_고장 = false;
  private static final HttpServer AI = AI_서버를_띄운다();

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private DataSource dataSource;

  @Value("${app.media.root}")
  private String 업로드_루트;

  // IntegrationTest 가 AI 주소를 비워 두고 그 값이 하위 클래스의 @DynamicPropertySource 보다 나중에
  // 적용되므로, 이 클래스만 스텁을 가리키는 설정 빈을 따로 둔다
  @TestConfiguration
  static class AI_스텁 {
    @Bean
    @Primary
    AiProperties aiStubProperties() {
      return new AiProperties(
          "http://127.0.0.1:" + AI.getAddress().getPort(), "test-secret", Duration.ofSeconds(3));
    }
  }

  @BeforeEach
  void AI_를_되돌린다() {
    AI_고장 = false;
  }

  @Test
  void 활동_사진은_추론하고_photoId_를_주며_촬영_위치와_순번을_남긴다() throws Exception {
    TestAccount 나 = 크루원이_된다("photo-ok@test.io");
    UUID 활동 = 활동을_시작한다(나);
    int 전 = AI_호출.get();

    String 응답 =
        mockMvc
            .perform(
                활동_사진을_올린다(나, UUID.randomUUID(), 활동, jpeg())
                    .param("lat", "37.5")
                    .param("lng", "127.1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.photoId").isNotEmpty())
            .andExpect(jsonPath("$.data.inference.status").value("OK"))
            .andExpect(jsonPath("$.data.inference.items.length()").value(2))
            .andReturn()
            .getResponse()
            .getContentAsString();
    String 둘째 = 사진_id(mockMvc.perform(활동_사진을_올린다(나, UUID.randomUUID(), 활동, jpeg())));

    assertThat(AI_호출.get() - 전).isEqualTo(2);
    UUID 첫째 = UUID.fromString(JsonPath.read(응답, "$.data.photoId"));
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT ST_Y(point) = 37.5 AND ST_X(point) = 127.1 AND order_index = 0"
                    + " AND inference_status = 'OK' AND activity_id = ? FROM activity_photos WHERE id = ?",
                Boolean.class,
                활동,
                첫째))
        .isTrue();
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT order_index FROM activity_photos WHERE id = ?",
                Integer.class,
                UUID.fromString(둘째)))
        .isEqualTo(1);
  }

  @Test
  void AI_서버가_실패해도_업로드는_200_이고_UNAVAILABLE_이며_사진은_남는다() throws Exception {
    TestAccount 나 = 크루원이_된다("photo-down@test.io");
    UUID 활동 = 활동을_시작한다(나);
    AI_고장 = true;

    String 사진 =
        사진_id(
            mockMvc
                .perform(활동_사진을_올린다(나, UUID.randomUUID(), 활동, jpeg()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.inference.status").value("UNAVAILABLE"))
                .andExpect(jsonPath("$.data.inference.items").isEmpty())
                .andExpect(jsonPath("$.data.url").isNotEmpty()));

    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT inference_status FROM activity_photos WHERE id = ?",
                String.class,
                UUID.fromString(사진)))
        .isEqualTo("UNAVAILABLE");
  }

  @Test
  void 게시물_프로필_크루_사진은_AI_를_부르지_않는다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "photo-noai@test.io");
    int 전 = AI_호출.get();

    for (String 용도 : new String[] {"POST", "PROFILE", "CREW"}) {
      mockMvc
          .perform(올린다(나, UUID.randomUUID(), 용도, jpeg()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.data.inference").isEmpty())
          .andExpect(jsonPath("$.data.photoId").isEmpty());
    }

    assertThat(AI_호출.get()).isEqualTo(전);
  }

  @Test
  void 같은_mediaId_를_두_번_보내면_사진도_행도_한_건이고_처음_추론이_됐으면_다시_추론한다() throws Exception {
    TestAccount 나 = 크루원이_된다("photo-resend@test.io");
    UUID 활동 = 활동을_시작한다(나);
    UUID mediaId = UUID.randomUUID();

    String 처음 = 사진_id(mockMvc.perform(활동_사진을_올린다(나, mediaId, 활동, jpeg())));
    int 전 = AI_호출.get();
    String 다시 =
        사진_id(
            mockMvc
                .perform(활동_사진을_올린다(나, mediaId, 활동, jpeg()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.inference.status").value("OK")));

    assertThat(다시).isEqualTo(처음);
    assertThat(AI_호출.get() - 전).isEqualTo(1);
    assertThat(행_수("media", "id", mediaId)).isEqualTo(1);
    assertThat(행_수("activity_photos", "media_id", mediaId)).isEqualTo(1);
  }

  @Test
  void 처음_추론이_안_됐어도_재전송은_다시_추론한다() throws Exception {
    TestAccount 나 = 크루원이_된다("photo-resend-down@test.io");
    UUID 활동 = 활동을_시작한다(나);
    UUID mediaId = UUID.randomUUID();
    AI_고장 = true;
    mockMvc.perform(활동_사진을_올린다(나, mediaId, 활동, jpeg())).andExpect(status().isOk());
    AI_고장 = false;
    int 전 = AI_호출.get();

    mockMvc
        .perform(활동_사진을_올린다(나, mediaId, 활동, jpeg()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.inference.status").value("OK"));

    assertThat(AI_호출.get() - 전).isEqualTo(1);
  }

  @Test
  void 다른_용도로_재전송하면_409_고_같은_용도면_200_이다() throws Exception {
    TestAccount 나 = 크루원이_된다("photo-purpose@test.io");
    UUID 활동_사진 = UUID.randomUUID();
    UUID 프로필 = UUID.randomUUID();
    mockMvc.perform(활동_사진을_올린다(나, 활동_사진, 활동을_시작한다(나), jpeg())).andExpect(status().isOk());
    mockMvc.perform(올린다(나, 프로필, "PROFILE", jpeg())).andExpect(status().isOk());

    mockMvc.perform(올린다(나, 활동_사진, "PROFILE", jpeg())).andExpect(status().isConflict());
    mockMvc.perform(올린다(나, 프로필, "POST", jpeg())).andExpect(status().isConflict());
    mockMvc.perform(올린다(나, 프로필, "PROFILE", jpeg())).andExpect(status().isOk());

    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT purpose FROM media WHERE id = ?", String.class, 프로필))
        .isEqualTo("PROFILE");
  }

  @Test
  void 끝난_활동의_사진을_재전송하면_404_이고_추론하지_않는다() throws Exception {
    TestAccount 나 = 크루원이_된다("photo-resend-ended@test.io");
    UUID 활동 = 활동을_시작한다(나);
    UUID mediaId = UUID.randomUUID();
    mockMvc.perform(활동_사진을_올린다(나, mediaId, 활동, jpeg())).andExpect(status().isOk());
    jdbcTemplate.update(
        "UPDATE activities SET status = 'ENDED', ended_at = now() WHERE id = ?", 활동);
    int 전 = AI_호출.get();

    mockMvc.perform(활동_사진을_올린다(나, mediaId, 활동, jpeg())).andExpect(status().isNotFound());

    assertThat(AI_호출.get()).isEqualTo(전);
  }

  @Test
  void 지우는_사이_프로필_사진으로_지정되면_지정을_기다렸다가_409_이고_프로필이_남는다() throws Exception {
    TestAccount 나 = 크루원이_된다("photo-delete-race@test.io");
    UUID mediaId = UUID.randomUUID();
    mockMvc.perform(활동_사진을_올린다(나, mediaId, 활동을_시작한다(나), jpeg())).andExpect(status().isOk());
    ExecutorService 손 = Executors.newSingleThreadExecutor();
    try (Connection 지정 = dataSource.getConnection()) {
      지정.setAutoCommit(false);
      try (PreparedStatement 문 =
          지정.prepareStatement("UPDATE users SET photo_media_id = ? WHERE id = ?")) {
        문.setObject(1, mediaId);
        문.setObject(2, 나.id());
        문.executeUpdate();
      }
      Future<Integer> 삭제 =
          손.submit(() -> mockMvc.perform(지운다(나, mediaId)).andReturn().getResponse().getStatus());
      사진_잠금을_기다릴_때까지_본다();
      지정.commit();

      assertThat(삭제.get()).isEqualTo(409);
    } finally {
      손.shutdown();
    }
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT photo_media_id FROM users WHERE id = ?", UUID.class, 나.id()))
        .isEqualTo(mediaId);
  }

  @Test
  void 남의_활동은_403_끝난_활동은_404_activityId_가_없으면_422_이고_아무것도_남지_않는다() throws Exception {
    TestAccount 나 = 크루원이_된다("photo-target@test.io");
    TestAccount 남 = 크루원이_된다("photo-target-other@test.io");
    UUID 남의_활동 = 활동을_시작한다(남);
    UUID 끝난_활동 = 활동을_시작한다(나);
    jdbcTemplate.update(
        "UPDATE activities SET status = 'ENDED', ended_at = now() WHERE id = ?", 끝난_활동);
    UUID 하나 = UUID.randomUUID();
    UUID 둘 = UUID.randomUUID();

    mockMvc.perform(활동_사진을_올린다(나, 하나, 남의_활동, jpeg())).andExpect(status().isForbidden());
    mockMvc
        .perform(활동_사진을_올린다(나, 둘, 끝난_활동, jpeg()))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    mockMvc
        .perform(올린다(나, UUID.randomUUID(), "ACTIVITY", jpeg()))
        .andExpect(status().isUnprocessableEntity());

    assertThat(행_수("media", "id", 하나) + 행_수("media", "id", 둘)).isZero();
    assertThat(파일(둘, false)).doesNotExist();
  }

  @Test
  void PNG_는_JPEG_로_바꿔_저장하고_10MB_를_넘으면_413_이다() throws Exception {
    TestAccount 나 = 크루원이_된다("photo-png@test.io");
    UUID 활동 = 활동을_시작한다(나);
    UUID mediaId = UUID.randomUUID();

    mockMvc.perform(활동_사진을_올린다(나, mediaId, 활동, png())).andExpect(status().isOk());
    mockMvc
        .perform(활동_사진을_올린다(나, UUID.randomUUID(), 활동, new byte[10 * 1024 * 1024 + 1]))
        .andExpect(status().isPayloadTooLarge())
        .andExpect(jsonPath("$.code").value("PAYLOAD_TOO_LARGE"));

    byte[] 저장된_것 = Files.readAllBytes(파일(mediaId, false));
    assertThat(저장된_것[0]).isEqualTo((byte) 0xFF);
    assertThat(저장된_것[1]).isEqualTo((byte) 0xD8);
  }

  @Test
  void 두_사람이_같은_mediaId_로_동시에_올리면_한쪽만_되고_남은_파일은_주인_것이다() throws Exception {
    TestAccount 가 = 가입한다(mockMvc, "photo-race-a@test.io");
    TestAccount 나 = 가입한다(mockMvc, "photo-race-b@test.io");
    UUID mediaId = UUID.randomUUID();
    CountDownLatch 출발 = new CountDownLatch(1);
    ExecutorService 손 = Executors.newFixedThreadPool(2);
    try {
      Future<Integer> 가의_결과 = 손.submit(() -> 동시에_올린다(출발, 가, mediaId));
      Future<Integer> 나의_결과 = 손.submit(() -> 동시에_올린다(출발, 나, mediaId));
      출발.countDown();

      assertThat(List.of(가의_결과.get(), 나의_결과.get())).containsExactlyInAnyOrder(200, 403);
    } finally {
      손.shutdown();
    }
    String 주인_키 =
        jdbcTemplate.queryForObject(
            "SELECT object_key FROM media WHERE id = ?", String.class, mediaId);
    try (var 경로들 = Files.walk(Path.of(업로드_루트))) {
      assertThat(
              경로들.map(it -> it.getFileName().toString())
                  .filter(이름 -> 이름.startsWith(mediaId + "-") && !이름.endsWith("_thumb.jpg")))
          .containsExactly(Path.of(주인_키).getFileName().toString());
    }
  }

  @Test
  void 버린_사진을_지우면_행과_파일이_사라지고_다시_지워도_204_다() throws Exception {
    TestAccount 나 = 크루원이_된다("photo-delete@test.io");
    UUID 활동 = 활동을_시작한다(나);
    UUID mediaId = UUID.randomUUID();
    mockMvc.perform(활동_사진을_올린다(나, mediaId, 활동, jpeg())).andExpect(status().isOk());

    mockMvc.perform(지운다(나, mediaId)).andExpect(status().isNoContent());
    mockMvc.perform(지운다(나, mediaId)).andExpect(status().isNoContent());
    mockMvc.perform(지운다(나, UUID.randomUUID())).andExpect(status().isNoContent());

    assertThat(행_수("media", "id", mediaId)).isZero();
    assertThat(행_수("activity_photos", "media_id", mediaId)).isZero();
    assertThat(파일(mediaId, false)).doesNotExist();
    assertThat(파일(mediaId, true)).doesNotExist();
  }

  @Test
  void 줍기가_붙은_사진_끝난_활동의_사진_프로필_사진은_409_이고_그대로_남는다() throws Exception {
    TestAccount 나 = 크루원이_된다("photo-keep@test.io");
    UUID 활동 = 활동을_시작한다(나);
    UUID 줍기_사진 = UUID.randomUUID();
    String 사진 = 사진_id(mockMvc.perform(활동_사진을_올린다(나, 줍기_사진, 활동, jpeg())));
    UUID 줍기 = UUID.randomUUID();
    mockMvc
        .perform(
            post("/api/v1/activities/{id}/items", 활동)
                .header(HttpHeaders.AUTHORIZATION, 나.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"photoId\":\"%s\",\"items\":[{\"id\":\"%s\",\"category\":\"CAN\",\"quantity\":1}]}"
                        .formatted(사진, 줍기)))
        .andExpect(status().isOk());
    UUID 프로필 = UUID.randomUUID();
    mockMvc.perform(올린다(나, 프로필, "PROFILE", jpeg())).andExpect(status().isOk());
    jdbcTemplate.update("UPDATE users SET photo_media_id = ? WHERE id = ?", 프로필, 나.id());

    mockMvc.perform(지운다(나, 줍기_사진)).andExpect(status().isConflict());
    mockMvc.perform(지운다(나, 프로필)).andExpect(status().isConflict());

    UUID 끝난_사진 = UUID.randomUUID();
    TestAccount 다른_나 = 크루원이_된다("photo-keep-ended@test.io");
    UUID 끝날_활동 = 활동을_시작한다(다른_나);
    mockMvc.perform(활동_사진을_올린다(다른_나, 끝난_사진, 끝날_활동, jpeg())).andExpect(status().isOk());
    jdbcTemplate.update(
        "UPDATE activities SET status = 'ENDED', ended_at = now() WHERE id = ?", 끝날_활동);
    mockMvc.perform(지운다(다른_나, 끝난_사진)).andExpect(status().isConflict());

    assertThat(행_수("activity_items", "id", 줍기)).isEqualTo(1);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT photo_media_id FROM users WHERE id = ?", UUID.class, 나.id()))
        .isEqualTo(프로필);
    assertThat(행_수("media", "id", 끝난_사진)).isEqualTo(1);
  }

  @Test
  void 남의_사진을_지우면_403_이다() throws Exception {
    TestAccount 나 = 크루원이_된다("photo-delete-owner@test.io");
    TestAccount 남 = 가입한다(mockMvc, "photo-delete-other@test.io");
    UUID mediaId = UUID.randomUUID();
    mockMvc.perform(활동_사진을_올린다(나, mediaId, 활동을_시작한다(나), jpeg())).andExpect(status().isOk());

    mockMvc.perform(지운다(남, mediaId)).andExpect(status().isForbidden());

    assertThat(행_수("media", "id", mediaId)).isEqualTo(1);
  }

  private void 사진_잠금을_기다릴_때까지_본다() throws InterruptedException {
    for (int i = 0; i < 100; i++) {
      Integer 대기 =
          jdbcTemplate.queryForObject(
              "SELECT count(*) FROM pg_stat_activity"
                  + " WHERE wait_event_type = 'Lock' AND query ILIKE '%from media%'",
              Integer.class);
      if (대기 > 0) {
        return;
      }
      Thread.sleep(50);
    }
    throw new AssertionError("삭제 요청이 사진 잠금을 기다리지 않는다");
  }

  private Integer 동시에_올린다(CountDownLatch 출발, TestAccount 계정, UUID mediaId) throws Exception {
    출발.await();
    return mockMvc.perform(올린다(계정, mediaId, "POST", jpeg())).andReturn().getResponse().getStatus();
  }

  private static HttpServer AI_서버를_띄운다() {
    try {
      HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
      server.createContext(
          "/internal/infer",
          exchange -> {
            AI_호출.incrementAndGet();
            exchange.getRequestBody().readAllBytes();
            if (AI_고장) {
              exchange.sendResponseHeaders(503, -1);
              exchange.close();
              return;
            }
            byte[] 본문 =
                ("{\"modelVersion\":\"stub-1\",\"inferenceMs\":12,\"items\":["
                        + "{\"bbox\":{\"x\":0.2,\"y\":0.3,\"w\":0.2,\"h\":0.25},\"category\":\"PLASTIC\",\"aiConfidence\":0.91},"
                        + "{\"bbox\":{\"x\":0.6,\"y\":0.4,\"w\":0.1,\"h\":0.1},\"category\":\"CAN\",\"aiConfidence\":0.62}]}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, 본문.length);
            exchange.getResponseBody().write(본문);
            exchange.close();
          });
      server.start();
      return server;
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
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

  private UUID 활동을_시작한다(TestAccount 계정) throws Exception {
    UUID 활동 = UUID.randomUUID();
    mockMvc
        .perform(
            post("/api/v1/activities")
                .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"id\":\"%s\",\"startedAt\":\"2026-10-14T09:00:00Z\",\"locationShared\":false}"
                        .formatted(활동)))
        .andExpect(status().isCreated());
    return 활동;
  }

  private static MockMultipartHttpServletRequestBuilder 올린다(
      TestAccount 계정, UUID mediaId, String 용도, byte[] 파일) {
    MockMultipartHttpServletRequestBuilder 요청 =
        multipart("/api/v1/media")
            .file(new MockMultipartFile("file", "photo.jpg", "image/jpeg", 파일));
    요청.param("mediaId", mediaId.toString())
        .param("purpose", 용도)
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer());
    return 요청;
  }

  private static MockMultipartHttpServletRequestBuilder 활동_사진을_올린다(
      TestAccount 계정, UUID mediaId, UUID 활동, byte[] 파일) {
    MockMultipartHttpServletRequestBuilder 요청 = 올린다(계정, mediaId, "ACTIVITY", 파일);
    요청.param("activityId", 활동.toString());
    return 요청;
  }

  private static org.springframework.test.web.servlet.RequestBuilder 지운다(
      TestAccount 계정, UUID mediaId) {
    return delete("/api/v1/media/{mediaId}", mediaId)
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private static String 사진_id(ResultActions 결과) throws Exception {
    return JsonPath.read(결과.andReturn().getResponse().getContentAsString(), "$.data.photoId");
  }

  private int 행_수(String 표, String 열, UUID 값) {
    return jdbcTemplate.queryForObject(
        "SELECT count(*) FROM " + 표 + " WHERE " + 열 + " = ?", Integer.class, 값);
  }

  // 파일 이름은 {mediaId}-{시도}.jpg · {mediaId}-{시도}_thumb.jpg 다
  private Path 파일(UUID mediaId, boolean 썸네일) throws IOException {
    try (var 경로들 = Files.walk(Path.of(업로드_루트))) {
      return 경로들.filter(
              it -> {
                String 이름 = it.getFileName().toString();
                return 이름.startsWith(mediaId + "-") && 이름.endsWith("_thumb.jpg") == 썸네일;
              })
          .findFirst()
          .orElse(Path.of(업로드_루트, "없음", mediaId + ".jpg"));
    }
  }

  private static byte[] jpeg() throws IOException {
    return 이미지("jpg");
  }

  private static byte[] png() throws IOException {
    return 이미지("png");
  }

  private static byte[] 이미지(String 형식) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(800, 600, BufferedImage.TYPE_INT_RGB), 형식, out);
    return out.toByteArray();
  }
}
