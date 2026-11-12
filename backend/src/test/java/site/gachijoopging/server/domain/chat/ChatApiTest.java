package site.gachijoopging.server.domain.chat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static site.gachijoopging.server.support.TestAccounts.가입한다;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Type;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.awaitility.Awaitility;
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
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;
import site.gachijoopging.server.domain.chat.dto.SendChatRequest;
import site.gachijoopging.server.domain.chat.service.ChatService;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts.TestAccount;

// LiveApiTest 와 같은 설정이어야 Spring 컨텍스트를 하나 더 만들지 않는다 — 컨텍스트마다 DB 연결 풀이 생긴다
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "live.broadcast-interval=1h")
@AutoConfigureMockMvc
class ChatApiTest extends IntegrationTest {

  private static final String 인증 = HttpHeaders.AUTHORIZATION;

  @LocalServerPort private int port;
  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private DataSource dataSource;
  @Autowired private SimpUserRegistry userRegistry;
  @Autowired private ChatService chatService;

  private final WebSocketStompClient stompClient = stompClient();
  private final List<StompSession> sessions = new ArrayList<>();

  @AfterEach
  void 연결을_닫는다() {
    sessions.forEach(StompSession::disconnect);
  }

  @Test
  void 같은_id_를_두_번_보내면_한_건만_저장되고_크루에는_한_번_보낸_사람에게는_다시_echo_한다() throws Exception {
    TestAccount 나 = 크루장이_된다("chat-dup-me@test.io");
    TestAccount 크루원 = 같은_크루에_넣는다(나, "chat-dup-member@test.io");
    BlockingQueue<Map<String, Object>> 내_수신 = 구독한다(나);
    BlockingQueue<Map<String, Object>> 크루원_수신 = 구독한다(크루원);
    StompSession 내_세션 = 연결한다(나);
    UUID id = UUID.randomUUID();

    내_세션.send("/app/crew/chat", Map.of("id", id.toString(), "text", "  내일 9시  "));
    Map<String, Object> 첫_echo = 받는다(내_수신, "CHAT");
    내_세션.send("/app/crew/chat", Map.of("id", id.toString(), "text", "  내일 9시  "));
    Map<String, Object> 둘째_echo = 받는다(내_수신, "CHAT");

    assertThat(데이터(첫_echo)).containsEntry("id", id.toString()).containsEntry("text", "내일 9시");
    assertThat(데이터(둘째_echo).get("seq")).isEqualTo(데이터(첫_echo).get("seq"));
    assertThat(데이터(받는다(크루원_수신, "CHAT"))).containsEntry("id", id.toString());
    assertThat(더_받지_않는다(크루원_수신, "CHAT")).isTrue();
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM chat_messages WHERE id = ?", Long.class, id))
        .isEqualTo(1);
    assertThat(보낸다(나, "다음 메시지")).isEqualTo(((Number) 데이터(첫_echo).get("seq")).longValue() + 1);
  }

  // 배포를 되돌리면 chat_seqs 를 모르는 옛 코드가 max(seq)+1 로 저장한다. 다시 올린 뒤 카운터가 그 seq 를 재사용하면 안 된다
  @Test
  void 카운터를_거치지_않고_저장된_메시지가_있어도_다음_메시지는_그_뒤_seq_를_받는다() throws Exception {
    TestAccount 나 = 크루장이_된다("chat-rollback@test.io");
    long 첫_seq = 보낸다(나, "카운터로 저장");
    jdbcTemplate.update(
        """
        INSERT INTO chat_messages (id, crew_id, seq, author_id, text, created_at)
        SELECT ?, crew_id, max(seq) + 1, author_id, '옛 코드로 저장', now()
        FROM chat_messages WHERE author_id = ? GROUP BY crew_id, author_id
        """,
        UUID.randomUUID(),
        나.id());

    assertThat(보낸다(나, "다시 올린 뒤")).isEqualTo(첫_seq + 2);
  }

  @Test
  void 다른_크루와_보낸_사람을_차단한_크루원에게는_CHAT_이_가지_않는다() throws Exception {
    TestAccount 나 = 크루장이_된다("chat-scope-me@test.io");
    TestAccount 차단자 = 같은_크루에_넣는다(나, "chat-scope-blocker@test.io");
    TestAccount 크루원 = 같은_크루에_넣는다(나, "chat-scope-member@test.io");
    TestAccount 남 = 크루장이_된다("chat-scope-stranger@test.io");
    mockMvc
        .perform(put("/api/v1/users/{userId}/block", 나.id()).header(인증, 차단자.bearer()))
        .andExpect(status().isNoContent());
    BlockingQueue<Map<String, Object>> 남_수신 = 구독한다(남);
    BlockingQueue<Map<String, Object>> 차단자_수신 = 구독한다(차단자);
    BlockingQueue<Map<String, Object>> 크루원_수신 = 구독한다(크루원);

    연결한다(나).send("/app/crew/chat", Map.of("id", UUID.randomUUID().toString(), "text", "안녕"));

    받는다(크루원_수신, "CHAT");
    assertThat(더_받지_않는다(남_수신, "CHAT")).isTrue();
    assertThat(더_받지_않는다(차단자_수신, "CHAT")).isTrue();
    assertThat(이력(차단자, "")).isEmpty();
  }

  @Test
  void 읽음_처리_뒤_unreadChat_은_0_이고_새_메시지가_오면_는다_가입_전_메시지는_세지_않는다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("chat-unread-leader@test.io");
    TestAccount 크루원 = 같은_크루에_넣는다(크루장, "chat-unread-member@test.io");
    보낸다(크루장, "하나");
    long 둘 = 보낸다(크루장, "둘");
    보낸다(크루원, "내 메시지는 세지 않는다");
    assertThat(안_읽음(크루원)).isEqualTo(2);

    읽는다(크루원, 둘);
    assertThat(안_읽음(크루원)).isZero();
    읽는다(크루원, 1);
    읽는다(크루원, 둘 + 100);
    assertThat(안_읽음(크루원)).isZero();

    보낸다(크루장, "셋");
    assertThat(안_읽음(크루원)).isEqualTo(1);

    TestAccount 새_크루원 = 같은_크루에_넣는다(크루장, "chat-unread-new@test.io");
    assertThat(안_읽음(새_크루원)).isZero();
  }

  @Test
  void 이력은_seq_오름차순이고_beforeSeq_afterSeq_로_이어지며_지운_메시지는_빠진다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("chat-history-leader@test.io");
    TestAccount 크루원 = 같은_크루에_넣는다(크루장, "chat-history-member@test.io");
    List<Long> seq = new ArrayList<>();
    for (int i = 1; i <= 5; i++) {
      seq.add(보낸다(크루장, "메시지" + i));
    }
    jdbcTemplate.update(
        "UPDATE chat_messages SET deleted_at = now() WHERE seq = ? AND author_id = ?",
        seq.get(2),
        크루장.id());

    JsonNode 최신 = 이력_본문(크루원, "?limit=2");
    assertThat(seq_목록(최신)).containsExactly(seq.get(3), seq.get(4));
    assertThat(최신.path("hasMore").asBoolean()).isTrue();

    JsonNode 이전 = 이력_본문(크루원, "?limit=2&beforeSeq=" + seq.get(3));
    assertThat(seq_목록(이전)).containsExactly(seq.get(0), seq.get(1));
    assertThat(이전.path("hasMore").asBoolean()).isFalse();

    JsonNode 다음 = 이력_본문(크루원, "?limit=2&afterSeq=" + seq.get(0));
    assertThat(seq_목록(다음)).containsExactly(seq.get(1), seq.get(3));
    assertThat(다음.path("hasMore").asBoolean()).isTrue();

    mockMvc
        .perform(이력_요청(크루원, "?beforeSeq=3&afterSeq=1"))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void 여러_스레드가_동시에_보내는_동안_afterSeq_로_이어받아도_빠짐없이_모인다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("chat-race-leader@test.io");
    List<TestAccount> 보내는_사람 = new ArrayList<>(List.of(크루장));
    for (int i = 0; i < 3; i++) {
      보내는_사람.add(같은_크루에_넣는다(크루장, "chat-race-" + i + "@test.io"));
    }
    int 건수 = 40;
    ExecutorService 스레드 = Executors.newFixedThreadPool(8);
    CountDownLatch 출발 = new CountDownLatch(1);
    List<Future<?>> 전송 = new ArrayList<>();
    for (int i = 0; i < 건수; i++) {
      TestAccount 계정 = 보내는_사람.get(i % 보내는_사람.size());
      String 글 = "동시" + i;
      전송.add(
          스레드.submit(
              () -> {
                출발.await();
                chatService.send(계정.id(), new SendChatRequest(UUID.randomUUID(), 글));
                return null;
              }));
    }

    List<Long> 모은_seq = Collections.synchronizedList(new ArrayList<>());
    출발.countDown();
    long 마지막 = 0;
    long 기한 = System.currentTimeMillis() + 20_000;
    while (모은_seq.size() < 건수 && System.currentTimeMillis() < 기한) {
      JsonNode 장 = 이력_본문(크루장, "?limit=50&afterSeq=" + 마지막);
      for (long s : seq_목록(장)) {
        모은_seq.add(s);
        마지막 = s;
      }
    }
    for (Future<?> 하나 : 전송) {
      하나.get(10, TimeUnit.SECONDS);
    }
    스레드.shutdown();

    assertThat(모은_seq).hasSize(건수).doesNotHaveDuplicates().isSorted();
    assertThat(모은_seq.getLast() - 모은_seq.getFirst()).isEqualTo(건수 - 1);
  }

  @Test
  void CHAT_알림은_읽은_뒤_첫_메시지에만_가고_보낸_사람은_받지_않는다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("chat-noti-leader@test.io");
    TestAccount 크루원 = 같은_크루에_넣는다(크루장, "chat-noti-member@test.io");

    보낸다(크루장, "하나");
    보낸다(크루장, "둘");
    long 셋 = 보낸다(크루장, "셋");

    assertThat(CHAT_알림_수(크루원)).isEqualTo(1);
    assertThat(CHAT_알림_수(크루장)).isZero();

    읽는다(크루원, 셋);
    보낸다(크루장, "넷");
    보낸다(크루장, "다섯");
    assertThat(CHAT_알림_수(크루원)).isEqualTo(2);

    TestAccount 새_크루원 = 같은_크루에_넣는다(크루장, "chat-noti-new@test.io");
    보낸다(크루장, "어서 와요");
    assertThat(CHAT_알림_수(새_크루원)).isEqualTo(1);
  }

  @Test
  void 신고_처리로_지우면_크루에_CHAT_DELETED_가_가고_이력에서_빠진다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("chat-delete-leader@test.io");
    TestAccount 신고자 = 같은_크루에_넣는다(크루장, "chat-delete-reporter@test.io");
    TestAccount 작성자 = 같은_크루에_넣는다(크루장, "chat-delete-author@test.io");
    UUID 메시지 = UUID.randomUUID();
    long seq = 보낸다(작성자, 메시지, "광고");
    UUID 신고 = UUID.randomUUID();
    mockMvc
        .perform(
            post("/api/v1/reports")
                .header(인증, 신고자.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        Map.of(
                            "id",
                            신고,
                            "targetType",
                            "CHAT_MESSAGE",
                            "targetId",
                            메시지,
                            "reason",
                            "SPAM"))))
        .andExpect(status().isCreated());
    BlockingQueue<Map<String, Object>> 신고자_수신 = 구독한다(신고자);

    mockMvc
        .perform(
            post("/api/v1/crew/reports/{reportId}", 신고)
                .header(인증, 크루장.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"result\":\"DELETE\"}"))
        .andExpect(status().isNoContent());

    assertThat(데이터(받는다(신고자_수신, "CHAT_DELETED"))).containsEntry("seq", (int) seq);
    assertThat(이력(신고자, "")).isEmpty();
  }

  @Test
  void 읽음_처리는_메시지_저장과_같은_크루_잠금을_기다린다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("chat-lock-leader@test.io");
    TestAccount 크루원 = 같은_크루에_넣는다(크루장, "chat-lock-member@test.io");
    long 하나 = 보낸다(크루장, "하나");
    UUID 크루 = 크루_id(크루장);

    try (Connection 연결 = dataSource.getConnection()) {
      연결.setAutoCommit(false);
      try (PreparedStatement 문장 =
          연결.prepareStatement(
              "SELECT pg_advisory_xact_lock(hashtext('chat'), hashtext(CAST(? AS text)))")) {
        문장.setObject(1, 크루);
        문장.execute();
      }
      CompletableFuture<ResultActions> 읽음 =
          CompletableFuture.supplyAsync(
              () -> {
                try {
                  return mockMvc.perform(읽음_요청(크루원, 하나));
                } catch (Exception e) {
                  throw new IllegalStateException(e);
                }
              });
      Awaitility.await()
          .atMost(Duration.ofSeconds(10))
          .until(
              () ->
                  jdbcTemplate.queryForObject(
                          "SELECT count(*) FROM pg_stat_activity WHERE wait_event = 'advisory'",
                          Long.class)
                      > 0);
      연결.commit();
      읽음.get(10, TimeUnit.SECONDS).andExpect(status().isNoContent());
    }
    assertThat(안_읽음(크루원)).isZero();
  }

  @Test
  void 남의_id_나_빈_글_501자_글은_저장하지_않고_limit_51_은_422_다() throws Exception {
    TestAccount 나 = 크루장이_된다("chat-reject-me@test.io");
    TestAccount 남 = 크루장이_된다("chat-reject-stranger@test.io");
    UUID 남의_메시지 = UUID.randomUUID();
    보낸다(남, 남의_메시지, "남의 크루 메시지");

    assertThatThrownBy(() -> 보낸다(나, 남의_메시지, "가로채기")).isInstanceOf(BusinessException.class);
    assertThatThrownBy(() -> 보낸다(나, "   ")).isInstanceOf(BusinessException.class);
    assertThatThrownBy(() -> 보낸다(나, "가".repeat(501))).isInstanceOf(BusinessException.class);
    보낸다(나, "😀".repeat(500));

    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM chat_messages WHERE author_id = ?", Long.class, 나.id()))
        .isEqualTo(1);
    mockMvc.perform(이력_요청(나, "?limit=51")).andExpect(status().isUnprocessableEntity());
  }

  @Test
  void 차단한_사람의_메시지는_안_읽음과_CHAT_알림에서_빠진다() throws Exception {
    TestAccount 크루장 = 크루장이_된다("chat-block-unread-leader@test.io");
    TestAccount 차단자 = 같은_크루에_넣는다(크루장, "chat-block-unread-blocker@test.io");
    TestAccount 크루원 = 같은_크루에_넣는다(크루장, "chat-block-unread-member@test.io");
    mockMvc
        .perform(put("/api/v1/users/{userId}/block", 크루장.id()).header(인증, 차단자.bearer()))
        .andExpect(status().isNoContent());

    보낸다(크루장, "차단당한 사람의 메시지");
    assertThat(안_읽음(차단자)).isZero();
    assertThat(CHAT_알림_수(차단자)).isZero();

    보낸다(크루원, "다른 사람의 메시지");
    assertThat(안_읽음(차단자)).isEqualTo(1);
    assertThat(CHAT_알림_수(차단자)).isEqualTo(1);
  }

  @Test
  void 신고로_지운_메시지를_같은_id_로_다시_보내면_보낸_사람에게만_echo_와_CHAT_DELETED_가_간다() throws Exception {
    TestAccount 나 = 크루장이_된다("chat-deleted-resend@test.io");
    TestAccount 크루원 = 같은_크루에_넣는다(나, "chat-deleted-resend-member@test.io");
    UUID id = UUID.randomUUID();
    long seq = 보낸다(나, id, "지워질 메시지");
    jdbcTemplate.update("UPDATE chat_messages SET deleted_at = now() WHERE id = ?", id);
    BlockingQueue<Map<String, Object>> 내_수신 = 구독한다(나);
    BlockingQueue<Map<String, Object>> 크루원_수신 = 구독한다(크루원);

    연결한다(나).send("/app/crew/chat", Map.of("id", id.toString(), "text", "지워질 메시지"));

    // 둘의 도착 순서는 정해져 있지 않다 (realtime.md §끊김과 이어받기)
    Map<String, Map<String, Object>> 받은 = new HashMap<>();
    long 기한 = System.currentTimeMillis() + 5_000;
    while (받은.size() < 2 && System.currentTimeMillis() < 기한) {
      Map<String, Object> 메시지 = 내_수신.poll(100, TimeUnit.MILLISECONDS);
      if (메시지 != null) {
        받은.put((String) 메시지.get("type"), 데이터(메시지));
      }
    }
    assertThat(받은.get("CHAT")).containsEntry("id", id.toString());
    assertThat(받은.get("CHAT_DELETED")).containsEntry("seq", (int) seq);
    assertThat(더_받지_않는다(크루원_수신, "CHAT")).isTrue();
    assertThat(더_받지_않는다(크루원_수신, "CHAT_DELETED")).isTrue();
  }

  private long 보낸다(TestAccount 계정, String 글) {
    return 보낸다(계정, UUID.randomUUID(), 글);
  }

  private long 보낸다(TestAccount 계정, UUID id, String 글) {
    chatService.send(계정.id(), new SendChatRequest(id, 글));
    return jdbcTemplate.queryForObject(
        "SELECT seq FROM chat_messages WHERE id = ?", Long.class, id);
  }

  private void 읽는다(TestAccount 계정, long seq) throws Exception {
    mockMvc.perform(읽음_요청(계정, seq)).andExpect(status().isNoContent());
  }

  private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder 읽음_요청(
      TestAccount 계정, long seq) {
    return put("/api/v1/crew/chat/read")
        .header(인증, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"lastSeq\":%d}".formatted(seq));
  }

  private int 안_읽음(TestAccount 계정) throws Exception {
    return 본문(mockMvc
            .perform(get("/api/v1/crew").header(인증, 계정.bearer()))
            .andExpect(status().isOk()))
        .path("unreadChat")
        .asInt();
  }

  private long CHAT_알림_수(TestAccount 계정) {
    return jdbcTemplate.queryForObject(
        "SELECT count(*) FROM notifications WHERE user_id = ? AND type = 'CHAT'",
        Long.class,
        계정.id());
  }

  private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder 이력_요청(
      TestAccount 계정, String 쿼리) {
    return get("/api/v1/crew/chat/messages" + 쿼리).header(인증, 계정.bearer());
  }

  private JsonNode 이력_본문(TestAccount 계정, String 쿼리) throws Exception {
    return 본문(mockMvc.perform(이력_요청(계정, 쿼리)).andExpect(status().isOk()));
  }

  private List<JsonNode> 이력(TestAccount 계정, String 쿼리) throws Exception {
    List<JsonNode> items = new ArrayList<>();
    이력_본문(계정, 쿼리).path("items").forEach(items::add);
    return items;
  }

  private static List<Long> seq_목록(JsonNode 장) {
    List<Long> seq = new ArrayList<>();
    장.path("items").forEach(item -> seq.add(item.path("seq").asLong()));
    return seq;
  }

  private JsonNode 본문(ResultActions 결과) throws Exception {
    return objectMapper.readTree(결과.andReturn().getResponse().getContentAsString()).path("data");
  }

  private UUID 크루_id(TestAccount 계정) {
    return jdbcTemplate.queryForObject(
        "SELECT crew_id FROM crew_members WHERE user_id = ?", UUID.class, 계정.id());
  }

  private TestAccount 크루장이_된다(String 이메일) throws Exception {
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

  // 가입 시각과 메시지 시각을 같은 앱 시계로 찍어야 "가입 전 메시지" 경계가 컨테이너 시계에 흔들리지 않는다
  private TestAccount 같은_크루에_넣는다(TestAccount 크루장, String 이메일) throws Exception {
    TestAccount 계정 = 가입한다(mockMvc, 이메일);
    mockMvc
        .perform(
            post("/api/v1/crews/join-requests")
                .header(인증, 계정.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"crewId\":\"%s\"}".formatted(크루_id(크루장))))
        .andExpect(status().isCreated());
    return 계정;
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
    Awaitility.await().atMost(Duration.ofSeconds(5)).until(() -> 구독_중(계정));
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

  private static boolean 더_받지_않는다(BlockingQueue<Map<String, Object>> 수신, String 종류)
      throws InterruptedException {
    long 기한 = System.currentTimeMillis() + 1_000;
    while (System.currentTimeMillis() < 기한) {
      Map<String, Object> 메시지 = 수신.poll(100, TimeUnit.MILLISECONDS);
      if (메시지 != null && 종류.equals(메시지.get("type"))) {
        return false;
      }
    }
    return true;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> 데이터(Map<String, Object> 메시지) {
    return (Map<String, Object>) 메시지.get("data");
  }

  private static WebSocketStompClient stompClient() {
    WebSocketStompClient client = new WebSocketStompClient(new StandardWebSocketClient());
    client.setMessageConverter(new MappingJackson2MessageConverter());
    return client;
  }
}
