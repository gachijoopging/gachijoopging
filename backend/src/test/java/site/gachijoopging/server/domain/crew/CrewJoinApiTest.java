package site.gachijoopging.server.domain.crew;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static site.gachijoopging.server.support.TestAccounts.가입한다;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import site.gachijoopging.server.domain.crew.event.JoinRequestDecidedEvent;
import site.gachijoopging.server.domain.crew.event.JoinRequestedEvent;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts.TestAccount;

@AutoConfigureMockMvc
@RecordApplicationEvents
class CrewJoinApiTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private ApplicationEvents events;
  @Autowired private JdbcTemplate jdbcTemplate;

  @Test
  void 비공개_크루에_신청하면_201_PENDING_이고_크루원은_아니다() throws Exception {
    String 크루 = 크루를_만든다(가입한다(mockMvc, "join-leader-1@test.io"));
    TestAccount 나 = 가입한다(mockMvc, "join-applicant-1@test.io");

    신청한다(나, 크루)
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.status").value("PENDING"))
        .andExpect(jsonPath("$.data.crew.id").value(크루))
        .andExpect(jsonPath("$.data.user.id").value(나.id().toString()));

    mockMvc
        .perform(내_정보(나))
        .andExpect(jsonPath("$.data.membership.status").value("PENDING"))
        .andExpect(jsonPath("$.data.membership.crew.isLeader").value(false));
    mockMvc.perform(내_신청(나)).andExpect(jsonPath("$.data.status").value("PENDING"));
    assertThat(크루원_수(크루)).isEqualTo(1);
    assertThat(events.stream(JoinRequestedEvent.class)).hasSize(1);
  }

  @Test
  void 공개_크루에_가입하면_201_APPROVED_이고_바로_크루원이다() throws Exception {
    String 크루 = 공개_크루를_만든다(가입한다(mockMvc, "join-open-leader@test.io"));
    TestAccount 나 = 가입한다(mockMvc, "join-open-me@test.io");

    String 신청 =
        신청_id(
            신청한다(나, 크루)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("APPROVED")));

    mockMvc.perform(내_정보(나)).andExpect(jsonPath("$.data.membership.status").value("MEMBER"));
    mockMvc.perform(내_신청(나)).andExpect(jsonPath("$.data.id").value(신청));
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT decided_by IS NULL AND decided_at = created_at FROM crew_join_requests"
                    + " WHERE id = ?",
                Boolean.class,
                UUID.fromString(신청)))
        .isTrue();
    assertThat(events.stream(JoinRequestedEvent.class)).isEmpty();
  }

  @Test
  void 같은_크루에_다시_신청하면_200_으로_같은_신청을_돌려준다() throws Exception {
    String 크루 = 크루를_만든다(가입한다(mockMvc, "join-leader-2@test.io"));
    TestAccount 나 = 가입한다(mockMvc, "join-applicant-2@test.io");
    String 첫_신청 = 신청_id(신청한다(나, 크루));

    신청한다(나, 크루).andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(첫_신청));
  }

  @Test
  void 같은_크루에_동시에_두_번_신청해도_신청은_하나고_201_과_200_이다() throws Exception {
    String 크루 = 크루를_만든다(가입한다(mockMvc, "join-leader-race@test.io"));
    TestAccount 나 = 가입한다(mockMvc, "join-applicant-race@test.io");

    assertThat(동시에(() -> 신청한다(나, 크루), () -> 신청한다(나, 크루))).containsExactlyInAnyOrder(201, 200);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM crew_join_requests WHERE user_id = ?", Integer.class, 나.id()))
        .isEqualTo(1);
  }

  @Test
  void 대기_중이면_다른_크루_가입_검색_만들기가_409_이고_신청은_그대로다() throws Exception {
    String 첫_크루 = 크루를_만든다(가입한다(mockMvc, "join-leader-3a@test.io"));
    String 공개_크루 = 공개_크루를_만든다(가입한다(mockMvc, "join-leader-3b@test.io"));
    TestAccount 나 = 가입한다(mockMvc, "join-applicant-3@test.io");
    String 첫_신청 = 신청_id(신청한다(나, 첫_크루));

    신청한다(나, 공개_크루)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("JOIN_REQUEST_PENDING"));
    mockMvc
        .perform(get("/api/v1/crews").header(HttpHeaders.AUTHORIZATION, 나.bearer()))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("JOIN_REQUEST_PENDING"));
    mockMvc
        .perform(만들기_요청(나, "대기중만든크루", "APPROVAL"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("JOIN_REQUEST_PENDING"));

    mockMvc
        .perform(내_신청(나))
        .andExpect(jsonPath("$.data.id").value(첫_신청))
        .andExpect(jsonPath("$.data.status").value("PENDING"));
  }

  @Test
  void 없는_크루는_404_형식이_틀린_id_는_422_다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "join-applicant-4@test.io");

    신청한다(나, UUID.randomUUID().toString()).andExpect(status().isNotFound());
    신청한다(나, "틀린아이디").andExpect(status().isUnprocessableEntity());
  }

  @Test
  void 이미_소속이면_409_ALREADY_IN_CREW_다() throws Exception {
    String 크루 = 크루를_만든다(가입한다(mockMvc, "join-leader-5a@test.io"));
    TestAccount 나 = 가입한다(mockMvc, "join-leader-5b@test.io");
    크루를_만든다(나);

    신청한다(나, 크루)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ALREADY_IN_CREW"));
  }

  @Test
  void 추방된_크루에는_공개든_비공개든_403_EXPELLED_FROM_CREW_다() throws Exception {
    TestAccount 공개_크루장 = 가입한다(mockMvc, "join-expel-open-leader@test.io");
    String 공개_크루 = 공개_크루를_만든다(공개_크루장);
    TestAccount 비공개_크루장 = 가입한다(mockMvc, "join-expel-closed-leader@test.io");
    String 비공개_크루 = 크루를_만든다(비공개_크루장);
    TestAccount 나 = 가입한다(mockMvc, "join-expelled@test.io");
    추방_이력을_남긴다(공개_크루, 나, 공개_크루장);
    추방_이력을_남긴다(비공개_크루, 나, 비공개_크루장);

    신청한다(나, 공개_크루)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("EXPELLED_FROM_CREW"));
    신청한다(나, 비공개_크루)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("EXPELLED_FROM_CREW"));
  }

  @Test
  void 정원이_찬_비공개_크루에는_새_신청이_409_CREW_FULL_이고_이전_대기는_남는다() throws Exception {
    String 크루 = 크루를_만든다(가입한다(mockMvc, "join-full-leader@test.io"));
    String 이전_신청 = 신청_id(신청한다(가입한다(mockMvc, "join-full-early@test.io"), 크루));
    크루원을_채운다(크루, 49);

    신청한다(가입한다(mockMvc, "join-full-late@test.io"), 크루)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CREW_FULL"));

    assertThat(신청_상태(이전_신청)).isEqualTo("PENDING");
  }

  @Test
  void 정원이_찬_크루의_승인은_409_CREW_FULL_이고_신청은_PENDING_이다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "join-full-approve-leader@test.io");
    String 크루 = 크루를_만든다(크루장);
    String 신청 = 신청_id(신청한다(가입한다(mockMvc, "join-full-approve-me@test.io"), 크루));
    크루원을_채운다(크루, 49);

    mockMvc
        .perform(처리한다(크루장, 신청, "APPROVE"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CREW_FULL"));

    assertThat(신청_상태(신청)).isEqualTo("PENDING");
    assertThat(크루원_수(크루)).isEqualTo(50);
  }

  @Test
  void 마흔아홉_명_공개_크루에_동시에_둘이_가입하면_하나만_되고_50명이다() throws Exception {
    String 크루 = 공개_크루를_만든다(가입한다(mockMvc, "join-race-open-leader@test.io"));
    크루원을_채운다(크루, 48);
    TestAccount 첫째 = 가입한다(mockMvc, "join-race-open-a@test.io");
    TestAccount 둘째 = 가입한다(mockMvc, "join-race-open-b@test.io");

    assertThat(동시에(() -> 신청한다(첫째, 크루), () -> 신청한다(둘째, 크루))).containsExactlyInAnyOrder(201, 409);
    assertThat(크루원_수(크루)).isEqualTo(50);
  }

  @Test
  void 한_사람이_공개_가입과_다른_크루_신청을_동시에_하면_하나만_된다() throws Exception {
    String 공개_크루 = 공개_크루를_만든다(가입한다(mockMvc, "join-mix-open-leader@test.io"));
    String 비공개_크루 = 크루를_만든다(가입한다(mockMvc, "join-mix-closed-leader@test.io"));
    TestAccount 나 = 가입한다(mockMvc, "join-mix-me@test.io");

    assertThat(동시에(() -> 신청한다(나, 공개_크루), () -> 신청한다(나, 비공개_크루)))
        .containsExactlyInAnyOrder(201, 409);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT (SELECT count(*) FROM crew_members WHERE user_id = ?)"
                    + " + (SELECT count(*) FROM crew_join_requests WHERE user_id = ? AND status = 'PENDING')",
                Integer.class,
                나.id(),
                나.id()))
        .isEqualTo(1);
  }

  @Test
  void 크루장은_대기_신청을_먼저_신청한_순으로_커서로_본다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "join-leader-6@test.io");
    String 크루 = 크루를_만든다(크루장);
    String 첫째 = 신청_id(신청한다(가입한다(mockMvc, "join-applicant-6a@test.io"), 크루));
    String 둘째 = 신청_id(신청한다(가입한다(mockMvc, "join-applicant-6b@test.io"), 크루));

    String 첫_페이지 =
        mockMvc
            .perform(대기_목록(크루장, null))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.items[0].id").value(첫째))
            .andExpect(jsonPath("$.data.items.length()").value(1))
            .andReturn()
            .getResponse()
            .getContentAsString();

    mockMvc
        .perform(대기_목록(크루장, JsonPath.read(첫_페이지, "$.data.nextCursor")))
        .andExpect(jsonPath("$.data.items[0].id").value(둘째))
        .andExpect(jsonPath("$.data.nextCursor").isEmpty());
  }

  @Test
  void 승인하면_크루원이_되고_목록에서_빠진다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "join-leader-7@test.io");
    String 크루 = 크루를_만든다(크루장);
    TestAccount 나 = 가입한다(mockMvc, "join-applicant-7@test.io");
    String 신청 = 신청_id(신청한다(나, 크루));

    mockMvc.perform(처리한다(크루장, 신청, "APPROVE")).andExpect(status().isNoContent());

    mockMvc
        .perform(get("/api/v1/crew").header(HttpHeaders.AUTHORIZATION, 나.bearer()))
        .andExpect(status().isOk());
    mockMvc.perform(내_정보(나)).andExpect(jsonPath("$.data.membership.status").value("MEMBER"));
    mockMvc.perform(내_신청(나)).andExpect(jsonPath("$.data.status").value("APPROVED"));
    mockMvc.perform(대기_목록(크루장, null)).andExpect(jsonPath("$.data.items.length()").value(0));
    assertThat(
            events.stream(JoinRequestDecidedEvent.class).filter(JoinRequestDecidedEvent::approved))
        .hasSize(1);
  }

  @Test
  void 거절하면_REJECTED_이고_다시_신청할_수_있다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "join-leader-8@test.io");
    String 크루 = 크루를_만든다(크루장);
    TestAccount 나 = 가입한다(mockMvc, "join-applicant-8@test.io");
    String 신청 = 신청_id(신청한다(나, 크루));

    mockMvc.perform(처리한다(크루장, 신청, "REJECT")).andExpect(status().isNoContent());

    mockMvc.perform(내_신청(나)).andExpect(jsonPath("$.data.status").value("REJECTED"));
    mockMvc.perform(내_정보(나)).andExpect(jsonPath("$.data.membership.status").value("NONE"));
    신청한다(나, 크루).andExpect(status().isCreated());
  }

  @Test
  void 크루원이_승인하면_403_FORBIDDEN_이다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "join-leader-9@test.io");
    String 크루 = 크루를_만든다(크루장);
    TestAccount 크루원 = 가입한다(mockMvc, "join-member-9@test.io");
    mockMvc.perform(처리한다(크루장, 신청_id(신청한다(크루원, 크루)), "APPROVE"));
    String 신청 = 신청_id(신청한다(가입한다(mockMvc, "join-applicant-9@test.io"), 크루));

    mockMvc
        .perform(처리한다(크루원, 신청, "APPROVE"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));
  }

  @Test
  void 다른_크루의_신청은_404_이미_처리한_신청은_409_다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "join-leader-10a@test.io");
    String 크루 = 크루를_만든다(크루장);
    TestAccount 남의_크루장 = 가입한다(mockMvc, "join-leader-10b@test.io");
    크루를_만든다(남의_크루장);
    String 신청 = 신청_id(신청한다(가입한다(mockMvc, "join-applicant-10@test.io"), 크루));

    mockMvc.perform(처리한다(남의_크루장, 신청, "APPROVE")).andExpect(status().isNotFound());
    mockMvc.perform(처리한다(크루장, 신청, "REJECT")).andExpect(status().isNoContent());
    mockMvc.perform(처리한다(크루장, 신청, "APPROVE")).andExpect(status().isConflict());
  }

  @Test
  void 신청을_취소하면_CANCELED_이고_소속은_NONE_이다() throws Exception {
    String 크루 = 크루를_만든다(가입한다(mockMvc, "join-leader-11@test.io"));
    TestAccount 나 = 가입한다(mockMvc, "join-applicant-11@test.io");
    신청한다(나, 크루);

    mockMvc
        .perform(
            delete("/api/v1/crews/join-requests/mine")
                .header(HttpHeaders.AUTHORIZATION, 나.bearer()))
        .andExpect(status().isNoContent());

    mockMvc.perform(내_신청(나)).andExpect(jsonPath("$.data.status").value("CANCELED"));
    mockMvc.perform(내_정보(나)).andExpect(jsonPath("$.data.membership.status").value("NONE"));
  }

  @Test
  void 신청한_적이_없으면_내_신청은_null_이다() throws Exception {
    mockMvc
        .perform(내_신청(가입한다(mockMvc, "join-applicant-12@test.io")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data").isEmpty());
  }

  private String 크루를_만든다(TestAccount 계정) throws Exception {
    return 만든다(계정, "APPROVAL");
  }

  private String 공개_크루를_만든다(TestAccount 계정) throws Exception {
    return 만든다(계정, "OPEN");
  }

  private String 만든다(TestAccount 계정, String 가입_방식) throws Exception {
    String 이름 = "크루" + UUID.randomUUID().toString().substring(0, 8);
    return JsonPath.read(
        mockMvc
            .perform(만들기_요청(계정, 이름, 가입_방식))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString(),
        "$.data.id");
  }

  private static MockHttpServletRequestBuilder 만들기_요청(TestAccount 계정, String 이름, String 가입_방식) {
    return post("/api/v1/crews")
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content(
            "{\"name\":\"%s\",\"region\":\"SEOUL\",\"joinPolicy\":\"%s\"}".formatted(이름, 가입_방식));
  }

  private ResultActions 신청한다(TestAccount 계정, String 크루) throws Exception {
    return mockMvc.perform(
        post("/api/v1/crews/join-requests")
            .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"crewId\":\"%s\"}".formatted(크루)));
  }

  private interface 요청 {
    ResultActions 보낸다() throws Exception;
  }

  private static List<Integer> 동시에(요청 첫째, 요청 둘째) throws Exception {
    CountDownLatch 출발 = new CountDownLatch(1);
    ExecutorService 두_손가락 = Executors.newFixedThreadPool(2);
    try {
      List<Future<Integer>> 결과 =
          List.of(첫째, 둘째).stream()
              .map(
                  보낼_것 ->
                      두_손가락.submit(
                          (Callable<Integer>)
                              () -> {
                                출발.await();
                                return 보낼_것.보낸다().andReturn().getResponse().getStatus();
                              }))
              .toList();
      출발.countDown();
      return List.of(결과.get(0).get(), 결과.get(1).get());
    } finally {
      두_손가락.shutdown();
    }
  }

  private void 크루원을_채운다(String 크루, int 명) {
    for (int i = 0; i < 명; i++) {
      UUID 사람 = UUID.randomUUID();
      jdbcTemplate.update("INSERT INTO users (id, updated_at) VALUES (?, now())", 사람);
      jdbcTemplate.update(
          "INSERT INTO crew_members (crew_id, user_id, joined_at) VALUES (?, ?, now())",
          UUID.fromString(크루),
          사람);
    }
  }

  private void 추방_이력을_남긴다(String 크루, TestAccount 사람, TestAccount 크루장) {
    jdbcTemplate.update(
        "INSERT INTO crew_expulsions (crew_id, user_id, expelled_by, expelled_at)"
            + " VALUES (?, ?, ?, now())",
        UUID.fromString(크루),
        사람.id(),
        크루장.id());
  }

  private int 크루원_수(String 크루) {
    return jdbcTemplate.queryForObject(
        "SELECT count(*) FROM crew_members WHERE crew_id = ?", Integer.class, UUID.fromString(크루));
  }

  private String 신청_상태(String 신청) {
    return jdbcTemplate.queryForObject(
        "SELECT status FROM crew_join_requests WHERE id = ?", String.class, UUID.fromString(신청));
  }

  private static String 신청_id(ResultActions 결과) throws Exception {
    return JsonPath.read(결과.andReturn().getResponse().getContentAsString(), "$.data.id");
  }

  private static MockHttpServletRequestBuilder 처리한다(TestAccount 계정, String 신청, String 결정) {
    return post("/api/v1/crew/join-requests/" + 신청)
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"decision\":\"%s\"}".formatted(결정));
  }

  private static MockHttpServletRequestBuilder 대기_목록(TestAccount 계정, String 커서) {
    MockHttpServletRequestBuilder 요청 =
        get("/api/v1/crew/join-requests")
            .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
            .param("limit", "1");
    return 커서 == null ? 요청 : 요청.param("cursor", 커서);
  }

  private static MockHttpServletRequestBuilder 내_신청(TestAccount 계정) {
    return get("/api/v1/crews/join-requests/mine").header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private static MockHttpServletRequestBuilder 내_정보(TestAccount 계정) {
    return get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }
}
