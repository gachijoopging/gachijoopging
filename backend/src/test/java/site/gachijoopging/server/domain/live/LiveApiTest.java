package site.gachijoopging.server.domain.live;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static site.gachijoopging.server.support.TestAccounts.가입한다;

import com.jayway.jsonpath.JsonPath;
import java.lang.reflect.Type;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.messaging.simp.user.SimpUserRegistry;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;
import org.springframework.web.socket.messaging.WebSocketStompClient;
import site.gachijoopging.server.domain.live.service.LiveBroadcaster;
import site.gachijoopging.server.global.security.jwt.JwtIssuer;
import site.gachijoopging.server.global.security.jwt.JwtProperties;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts.TestAccount;

// 묶음 발송 주기를 테스트가 직접 flush() 로 정한다 — 주기가 끼어들면 "한 번만" 이 흔들린다
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "live.broadcast-interval=1h")
@AutoConfigureMockMvc
class LiveApiTest extends IntegrationTest {

  @LocalServerPort private int port;
  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private LiveBroadcaster broadcaster;
  @Autowired private JwtProperties jwtProperties;
  @Autowired private SimpUserRegistry userRegistry;

  private final WebSocketStompClient stompClient = stompClient();
  private final List<StompSession> sessions = new ArrayList<>();

  @AfterEach
  void 연결을_닫는다() {
    sessions.forEach(StompSession::disconnect);
  }

  @Test
  void 만료되거나_없는_토큰은_4401_로_닫는다() throws Exception {
    TestAccount 나 = 크루원이_된다("live-expired@test.io");
    String 만료 =
        new JwtIssuer(
                jwtProperties, Clock.fixed(Instant.parse("2020-01-01T00:00:00Z"), ZoneOffset.UTC))
            .issue(나.id());

    assertThat(닫힘_코드("?token=" + 만료)).isEqualTo(4401);
    assertThat(닫힘_코드("")).isEqualTo(4401);
  }

  @Test
  void 소속_크루가_없으면_4403_으로_닫는다() throws Exception {
    TestAccount 미가입자 = 가입한다(mockMvc, "live-nocrew@test.io");

    assertThat(닫힘_코드("?token=" + 미가입자.accessToken())).isEqualTo(4403);
  }

  @Test
  void 크루_큐_말고는_구독할_수_없고_브로커로_직접_보낼_수_없다() throws Exception {
    TestAccount 나 = 크루원이_된다("live-dest@test.io");

    assertThat(거절_프레임(나, 세션 -> 세션.subscribe("/queue/crew", 무시))).isTrue();
    assertThat(거절_프레임(나, 세션 -> 세션.send("/queue/crew", Map.of("type", "LIVE_ENDED")))).isTrue();
    assertThat(구독_중(나)).isFalse();
  }

  @Test
  void 시작_갱신_종료가_같은_크루에만_가고_갱신은_5초_묶음에_마지막_값만_나간다() throws Exception {
    TestAccount 나 = 크루원이_된다("live-flow@test.io");
    TestAccount 크루원 = 같은_크루에_넣는다(나, "live-flow-mate@test.io");
    TestAccount 남 = 크루원이_된다("live-flow-other@test.io");
    BlockingQueue<Map<String, Object>> 크루원_수신 = 구독한다(크루원);
    BlockingQueue<Map<String, Object>> 남_수신 = 구독한다(남);

    UUID 활동 = 시작한다(나, true);
    Map<String, Object> 시작 = 받는다(크루원_수신, "LIVE_STARTED");
    assertThat(JsonPath.<String>read(시작, "$.data.activityId")).isEqualTo(활동.toString());
    assertThat(JsonPath.<String>read(시작, "$.data.user.id")).isEqualTo(나.id().toString());

    보고한다(나, 활동, 100, 126.9, 37.5).andExpect(status().isNoContent());
    보고한다(나, 활동, 200, 126.9, 37.5);
    보고한다(나, 활동, 300, 126.93, 37.52);
    broadcaster.flush();
    Map<String, Object> 갱신 = 받는다(크루원_수신, "LIVE_UPDATE");
    assertThat(JsonPath.<Integer>read(갱신, "$.data.distanceM")).isEqualTo(300);
    assertThat(JsonPath.<Double>read(갱신, "$.data.location.lng")).isEqualTo(126.93);
    assertThat(JsonPath.<Boolean>read(갱신, "$.data.locationShared")).isTrue();
    assertThat(크루원_수신.poll(500, TimeUnit.MILLISECONDS)).isNull();

    끝낸다(나, 활동);
    Map<String, Object> 종료 = 받는다(크루원_수신, "LIVE_ENDED");
    assertThat(JsonPath.<String>read(종료, "$.data.userId")).isEqualTo(나.id().toString());
    assertThat(JsonPath.<String>read(종료, "$.data.activityId")).isEqualTo(활동.toString());
    mockMvc.perform(활동_중(크루원)).andExpect(jsonPath("$.data.length()").value(0));

    assertThat(남_수신.poll(500, TimeUnit.MILLISECONDS)).isNull();
  }

  @Test
  void 위치_공유를_끈_사용자는_location_null_에_거리와_개수를_그대로_보낸다() throws Exception {
    TestAccount 나 = 크루원이_된다("live-private@test.io");
    TestAccount 크루원 = 같은_크루에_넣는다(나, "live-private-mate@test.io");
    BlockingQueue<Map<String, Object>> 크루원_수신 = 구독한다(크루원);

    UUID 활동 = 시작한다(나, false);
    보고한다(나, 활동, 500, 126.9, 37.5);
    broadcaster.flush();

    Map<String, Object> 갱신 = 받는다(크루원_수신, "LIVE_UPDATE");
    assertThat(JsonPath.<Object>read(갱신, "$.data.location")).isNull();
    assertThat(JsonPath.<Boolean>read(갱신, "$.data.locationShared")).isFalse();
    assertThat(JsonPath.<Integer>read(갱신, "$.data.distanceM")).isEqualTo(500);
    assertThat(JsonPath.<Integer>read(갱신, "$.data.itemCount")).isEqualTo(3);
    mockMvc
        .perform(활동_중(크루원))
        .andExpect(jsonPath("$.data[0].location").isEmpty())
        .andExpect(jsonPath("$.data[0].locationShared").value(false))
        .andExpect(jsonPath("$.data[0].distanceM").value(500));
  }

  @Test
  void 차단한_사람에게는_대상의_위치가_가지_않고_목록에서도_빠진다() throws Exception {
    TestAccount 나 = 크루원이_된다("live-block@test.io");
    TestAccount 차단자 = 같은_크루에_넣는다(나, "live-block-blocker@test.io");
    TestAccount 크루원 = 같은_크루에_넣는다(나, "live-block-mate@test.io");
    jdbcTemplate.update(
        "INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?)", 차단자.id(), 나.id());
    BlockingQueue<Map<String, Object>> 차단자_수신 = 구독한다(차단자);
    BlockingQueue<Map<String, Object>> 크루원_수신 = 구독한다(크루원);

    UUID 활동 = 시작한다(나, true);
    보고한다(나, 활동, 100, 126.9, 37.5);
    broadcaster.flush();

    받는다(크루원_수신, "LIVE_UPDATE");
    assertThat(차단자_수신.poll(500, TimeUnit.MILLISECONDS)).isNull();
    mockMvc.perform(활동_중(차단자)).andExpect(jsonPath("$.data.length()").value(0));
    mockMvc.perform(활동_중(크루원)).andExpect(jsonPath("$.data.length()").value(1));
  }

  @Test
  void 크루원_목록은_사람당_최신_한_행이고_소켓으로_보낸_점도_같은_행에_쌓인다() throws Exception {
    TestAccount 나 = 크루원이_된다("live-latest@test.io");
    UUID 활동 = 시작한다(나, true);
    mockMvc
        .perform(활동_중(나))
        .andExpect(jsonPath("$.data.length()").value(1))
        .andExpect(jsonPath("$.data[0].location").isEmpty())
        .andExpect(jsonPath("$.data[0].locationShared").value(true));

    보고한다(나, 활동, 100, 126.9, 37.5);
    StompSession 세션 = 연결한다(나);
    세션.send(
        "/app/crew/live",
        Map.of(
            "activityId",
            활동.toString(),
            "location",
            Map.of("lng", 127.0, "lat", 37.6),
            "distanceM",
            250,
            "itemCount",
            4,
            "elapsedSec",
            60,
            "paused",
            true));

    long 기한 = System.currentTimeMillis() + 5_000;
    while (jdbcTemplate.queryForObject(
                "SELECT distance_m FROM live_locations WHERE user_id = ?", Integer.class, 나.id())
            != 250
        && System.currentTimeMillis() < 기한) {
      Thread.sleep(50);
    }
    mockMvc
        .perform(활동_중(나))
        .andExpect(jsonPath("$.data.length()").value(1))
        .andExpect(jsonPath("$.data[0].distanceM").value(250))
        .andExpect(jsonPath("$.data[0].paused").value(true))
        .andExpect(jsonPath("$.data[0].location.lng").value(127.0));
  }

  @Test
  void 남의_활동에_보고하면_403_없는_활동이면_404_다() throws Exception {
    TestAccount 나 = 크루원이_된다("live-owner@test.io");
    TestAccount 남 = 같은_크루에_넣는다(나, "live-owner-other@test.io");
    UUID 활동 = 시작한다(나, true);

    보고한다(남, 활동, 100, 126.9, 37.5)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    보고한다(나, UUID.randomUUID(), 100, 126.9, 37.5).andExpect(status().isNotFound());
  }

  private int 닫힘_코드(String 쿼리) throws Exception {
    CompletableFuture<CloseStatus> 닫힘 = new CompletableFuture<>();
    new StandardWebSocketClient()
        .execute(
            new AbstractWebSocketHandler() {
              @Override
              public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
                닫힘.complete(status);
              }
            },
            "ws://localhost:" + port + "/api/v1/ws" + 쿼리)
        .get(5, TimeUnit.SECONDS);
    return 닫힘.get(5, TimeUnit.SECONDS).getCode();
  }

  private static final StompFrameHandler 무시 =
      new StompFrameHandler() {
        @Override
        public Type getPayloadType(StompHeaders headers) {
          return Map.class;
        }

        @Override
        public void handleFrame(StompHeaders headers, Object payload) {}
      };

  private boolean 거절_프레임(TestAccount 계정, Consumer<StompSession> 시도) throws Exception {
    CompletableFuture<StompHeaders> 오류 = new CompletableFuture<>();
    StompSession 세션 =
        stompClient
            .connectAsync(
                "ws://localhost:" + port + "/api/v1/ws?token=" + 계정.accessToken(),
                new StompSessionHandlerAdapter() {
                  @Override
                  public void handleFrame(StompHeaders headers, Object payload) {
                    오류.complete(headers);
                  }
                })
            .get(5, TimeUnit.SECONDS);
    시도.accept(세션);
    return 오류.get(5, TimeUnit.SECONDS) != null;
  }

  private StompSession 연결한다(TestAccount 계정) throws Exception {
    StompSession 세션 =
        stompClient
            .connectAsync(
                "ws://localhost:" + port + "/api/v1/ws?token=" + 계정.accessToken(),
                new StompSessionHandlerAdapter() {})
            .get(5, TimeUnit.SECONDS);
    sessions.add(세션);
    return 세션;
  }

  private BlockingQueue<Map<String, Object>> 구독한다(TestAccount 계정) throws Exception {
    BlockingQueue<Map<String, Object>> 수신 = new LinkedBlockingQueue<>();
    StompSession 세션 = 연결한다(계정);
    세션.subscribe(
        "/user/queue/crew",
        new StompFrameHandler() {
          @Override
          public Type getPayloadType(StompHeaders headers) {
            return Map.class;
          }

          @Override
          @SuppressWarnings("unchecked")
          public void handleFrame(StompHeaders headers, Object payload) {
            수신.add((Map<String, Object>) payload);
          }
        });
    // simple broker 는 RECEIPT 를 주지 않는다. 구독이 등록됐는지는 사용자 레지스트리로 본다
    long 기한 = System.currentTimeMillis() + 5_000;
    while (!구독_중(계정) && System.currentTimeMillis() < 기한) {
      Thread.sleep(20);
    }
    assertThat(구독_중(계정)).isTrue();
    return 수신;
  }

  private boolean 구독_중(TestAccount 계정) {
    var 사용자 = userRegistry.getUser(계정.id().toString());
    return 사용자 != null
        && 사용자.getSessions().stream().anyMatch(세션 -> !세션.getSubscriptions().isEmpty());
  }

  private static Map<String, Object> 받는다(BlockingQueue<Map<String, Object>> 수신, String 종류)
      throws InterruptedException {
    long 기한 = System.currentTimeMillis() + 5_000;
    while (System.currentTimeMillis() < 기한) {
      Map<String, Object> 메시지 = 수신.poll(100, TimeUnit.MILLISECONDS);
      if (메시지 != null && 종류.equals(메시지.get("type"))) {
        return 메시지;
      }
    }
    throw new AssertionError(종류 + " 를 받지 못했다");
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

  private TestAccount 같은_크루에_넣는다(TestAccount 크루장, String 이메일) throws Exception {
    TestAccount 계정 = 가입한다(mockMvc, 이메일);
    jdbcTemplate.update(
        "INSERT INTO crew_members (crew_id, user_id, joined_at)"
            + " SELECT crew_id, ?, now() FROM crew_members WHERE user_id = ?",
        계정.id(),
        크루장.id());
    return 계정;
  }

  private UUID 시작한다(TestAccount 계정, boolean 위치_공유) throws Exception {
    UUID 활동 = UUID.randomUUID();
    mockMvc
        .perform(
            post("/api/v1/activities")
                .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"id\":\"%s\",\"startedAt\":\"2026-10-13T09:00:00Z\",\"locationShared\":%s}"
                        .formatted(활동, 위치_공유)))
        .andExpect(status().isCreated());
    return 활동;
  }

  private ResultActions 보고한다(TestAccount 계정, UUID 활동, int 거리, double lng, double lat)
      throws Exception {
    return mockMvc.perform(
        post("/api/v1/activities/{id}/live", 활동)
            .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                ("{\"location\":{\"lng\":%s,\"lat\":%s},\"distanceM\":%d,\"itemCount\":3,"
                        + "\"elapsedSec\":60,\"paused\":false}")
                    .formatted(lng, lat, 거리)));
  }

  private void 끝낸다(TestAccount 계정, UUID 활동) throws Exception {
    mockMvc
        .perform(
            post("/api/v1/activities/{id}/end", 활동)
                .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"endedAt\":\"2026-10-13T09:10:00Z\",\"durationSec\":600,\"pausedSec\":0,"
                        + "\"distanceM\":300,\"route\":[]}"))
        .andExpect(status().isOk());
  }

  private static MockHttpServletRequestBuilder 활동_중(TestAccount 계정) {
    return get("/api/v1/crew/live").header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private static WebSocketStompClient stompClient() {
    WebSocketStompClient client = new WebSocketStompClient(new StandardWebSocketClient());
    client.setMessageConverter(new MappingJackson2MessageConverter());
    return client;
  }
}
