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
  void 초대_코드로_신청하면_201_PENDING_이고_내_소속이_PENDING_이다() throws Exception {
    String 코드 = 크루를_만든다(가입한다(mockMvc, "join-leader-1@test.io"));
    TestAccount 나 = 가입한다(mockMvc, "join-applicant-1@test.io");

    신청한다(나, 코드)
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.data.status").value("PENDING"))
        .andExpect(jsonPath("$.data.user.id").value(나.id().toString()));

    mockMvc
        .perform(내_정보(나))
        .andExpect(jsonPath("$.data.membership.status").value("PENDING"))
        .andExpect(jsonPath("$.data.membership.crew.isLeader").value(false));
    mockMvc.perform(내_신청(나)).andExpect(jsonPath("$.data.status").value("PENDING"));
    assertThat(events.stream(JoinRequestedEvent.class)).hasSize(1);
  }

  @Test
  void 같은_크루에_다시_신청하면_200_으로_같은_신청을_돌려준다() throws Exception {
    String 코드 = 크루를_만든다(가입한다(mockMvc, "join-leader-2@test.io"));
    TestAccount 나 = 가입한다(mockMvc, "join-applicant-2@test.io");
    String 첫_신청 = 신청_id(신청한다(나, 코드));

    신청한다(나, 코드.toLowerCase().replace("-", ""))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.id").value(첫_신청));
  }

  @Test
  void 같은_크루에_동시에_두_번_신청해도_신청은_하나고_201_과_200_이다() throws Exception {
    String 코드 = 크루를_만든다(가입한다(mockMvc, "join-leader-race@test.io"));
    TestAccount 나 = 가입한다(mockMvc, "join-applicant-race@test.io");
    CountDownLatch 출발 = new CountDownLatch(1);
    Callable<Integer> 신청 =
        () -> {
          출발.await();
          return 신청한다(나, 코드).andReturn().getResponse().getStatus();
        };

    ExecutorService 두_손가락 = Executors.newFixedThreadPool(2);
    try {
      List<Future<Integer>> 결과 = List.of(두_손가락.submit(신청), 두_손가락.submit(신청));
      출발.countDown();
      assertThat(List.of(결과.get(0).get(), 결과.get(1).get())).containsExactlyInAnyOrder(201, 200);
    } finally {
      두_손가락.shutdown();
    }
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM crew_join_requests WHERE user_id = ?", Integer.class, 나.id()))
        .isEqualTo(1);
  }

  @Test
  void 다른_크루에_신청하면_이전_신청은_취소되고_새로_201_이다() throws Exception {
    String 첫_코드 = 크루를_만든다(가입한다(mockMvc, "join-leader-3a@test.io"));
    String 둘째_코드 = 크루를_만든다(가입한다(mockMvc, "join-leader-3b@test.io"));
    TestAccount 나 = 가입한다(mockMvc, "join-applicant-3@test.io");
    String 첫_신청 = 신청_id(신청한다(나, 첫_코드));

    String 둘째_신청 = 신청_id(신청한다(나, 둘째_코드).andExpect(status().isCreated()));

    assertThat(둘째_신청).isNotEqualTo(첫_신청);
    mockMvc.perform(내_신청(나)).andExpect(jsonPath("$.data.id").value(둘째_신청));
  }

  @Test
  void 없는_코드는_404_형식이_틀린_코드는_422_다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "join-applicant-4@test.io");

    신청한다(나, "ZZ-ZZZZ").andExpect(status().isNotFound());
    신청한다(나, "틀린코드").andExpect(status().isUnprocessableEntity());
  }

  @Test
  void 이미_소속이면_409_ALREADY_IN_CREW_다() throws Exception {
    String 코드 = 크루를_만든다(가입한다(mockMvc, "join-leader-5a@test.io"));
    TestAccount 나 = 가입한다(mockMvc, "join-leader-5b@test.io");
    크루를_만든다(나);

    신청한다(나, 코드)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ALREADY_IN_CREW"));
  }

  @Test
  void 크루장은_대기_신청을_먼저_신청한_순으로_커서로_본다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "join-leader-6@test.io");
    String 코드 = 크루를_만든다(크루장);
    String 첫째 = 신청_id(신청한다(가입한다(mockMvc, "join-applicant-6a@test.io"), 코드));
    String 둘째 = 신청_id(신청한다(가입한다(mockMvc, "join-applicant-6b@test.io"), 코드));

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
    String 코드 = 크루를_만든다(크루장);
    TestAccount 나 = 가입한다(mockMvc, "join-applicant-7@test.io");
    String 신청 = 신청_id(신청한다(나, 코드));

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
    String 코드 = 크루를_만든다(크루장);
    TestAccount 나 = 가입한다(mockMvc, "join-applicant-8@test.io");
    String 신청 = 신청_id(신청한다(나, 코드));

    mockMvc.perform(처리한다(크루장, 신청, "REJECT")).andExpect(status().isNoContent());

    mockMvc.perform(내_신청(나)).andExpect(jsonPath("$.data.status").value("REJECTED"));
    mockMvc.perform(내_정보(나)).andExpect(jsonPath("$.data.membership.status").value("NONE"));
    신청한다(나, 코드).andExpect(status().isCreated());
  }

  @Test
  void 크루원이_승인하면_403_FORBIDDEN_이다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "join-leader-9@test.io");
    String 코드 = 크루를_만든다(크루장);
    TestAccount 크루원 = 가입한다(mockMvc, "join-member-9@test.io");
    mockMvc.perform(처리한다(크루장, 신청_id(신청한다(크루원, 코드)), "APPROVE"));
    String 신청 = 신청_id(신청한다(가입한다(mockMvc, "join-applicant-9@test.io"), 코드));

    mockMvc
        .perform(처리한다(크루원, 신청, "APPROVE"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));
  }

  @Test
  void 다른_크루의_신청은_404_이미_처리한_신청은_409_다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "join-leader-10a@test.io");
    String 코드 = 크루를_만든다(크루장);
    TestAccount 남의_크루장 = 가입한다(mockMvc, "join-leader-10b@test.io");
    크루를_만든다(남의_크루장);
    String 신청 = 신청_id(신청한다(가입한다(mockMvc, "join-applicant-10@test.io"), 코드));

    mockMvc.perform(처리한다(남의_크루장, 신청, "APPROVE")).andExpect(status().isNotFound());
    mockMvc.perform(처리한다(크루장, 신청, "REJECT")).andExpect(status().isNoContent());
    mockMvc.perform(처리한다(크루장, 신청, "APPROVE")).andExpect(status().isConflict());
  }

  @Test
  void 신청을_취소하면_CANCELED_이고_소속은_NONE_이다() throws Exception {
    String 코드 = 크루를_만든다(가입한다(mockMvc, "join-leader-11@test.io"));
    TestAccount 나 = 가입한다(mockMvc, "join-applicant-11@test.io");
    신청한다(나, 코드);

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

  @Test
  void 초대_코드를_재발급하면_옛_코드는_404_고_기존_대기_신청은_남는다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "join-leader-13@test.io");
    String 옛_코드 = 크루를_만든다(크루장);
    신청한다(가입한다(mockMvc, "join-applicant-13a@test.io"), 옛_코드);

    String 새_코드 =
        JsonPath.read(
            mockMvc
                .perform(
                    post("/api/v1/crew/invite-code")
                        .header(HttpHeaders.AUTHORIZATION, 크루장.bearer()))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString(),
            "$.data.inviteCode");

    assertThat(새_코드).isNotEqualTo(옛_코드);
    신청한다(가입한다(mockMvc, "join-applicant-13b@test.io"), 옛_코드).andExpect(status().isNotFound());
    신청한다(가입한다(mockMvc, "join-applicant-13c@test.io"), 새_코드).andExpect(status().isCreated());
    mockMvc.perform(대기_목록(크루장, null)).andExpect(jsonPath("$.data.nextCursor").isNotEmpty());
  }

  @Test
  void 크루원은_초대_코드를_재발급할_수_없다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "join-leader-14@test.io");
    String 코드 = 크루를_만든다(크루장);
    TestAccount 크루원 = 가입한다(mockMvc, "join-member-14@test.io");
    mockMvc.perform(처리한다(크루장, 신청_id(신청한다(크루원, 코드)), "APPROVE"));

    mockMvc
        .perform(post("/api/v1/crew/invite-code").header(HttpHeaders.AUTHORIZATION, 크루원.bearer()))
        .andExpect(status().isForbidden());
  }

  @Test
  void 크루를_만들면_넣어_둔_가입_신청은_취소된다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "join-leader-15@test.io");
    String 코드 = 크루를_만든다(크루장);
    TestAccount 나 = 가입한다(mockMvc, "join-applicant-15@test.io");
    신청한다(나, 코드);

    크루를_만든다(나);

    mockMvc.perform(내_신청(나)).andExpect(jsonPath("$.data.status").value("CANCELED"));
    mockMvc.perform(대기_목록(크루장, null)).andExpect(jsonPath("$.data.items.length()").value(0));
  }

  private String 크루를_만든다(TestAccount 계정) throws Exception {
    String 이름 = "크루" + UUID.randomUUID().toString().substring(0, 8);
    return JsonPath.read(
        mockMvc
            .perform(
                post("/api/v1/crews")
                    .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"name\":\"%s\"}".formatted(이름)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString(),
        "$.data.inviteCode");
  }

  private ResultActions 신청한다(TestAccount 계정, String 코드) throws Exception {
    return mockMvc.perform(
        post("/api/v1/crews/join-requests")
            .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"inviteCode\":\"%s\"}".formatted(코드)));
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
