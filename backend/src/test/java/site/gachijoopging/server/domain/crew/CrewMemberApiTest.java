package site.gachijoopging.server.domain.crew;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static site.gachijoopging.server.support.TestAccounts.가입한다;

import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
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
import site.gachijoopging.server.domain.crew.event.MemberExpelledEvent;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts.TestAccount;

@AutoConfigureMockMvc
@RecordApplicationEvents
class CrewMemberApiTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private ApplicationEvents events;
  @Autowired private JdbcTemplate jdbcTemplate;

  @Test
  void 크루원_목록은_크루장_먼저_나머지는_닉네임순이고_이_크루에서_끝낸_활동만_센다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "members-leader@test.io");
    String 크루 = 공개_크루를_만든다(크루장);
    TestAccount 나중 = 가입한다(mockMvc, "members-b@test.io");
    TestAccount 먼저 = 가입한다(mockMvc, "members-a@test.io");
    닉네임을_바꾼다(크루장, "하");
    닉네임을_바꾼다(나중, "나");
    닉네임을_바꾼다(먼저, "가");
    크루에_들어간다(먼저, 크루);
    크루에_들어간다(나중, 크루);
    활동을_넣는다(먼저, 크루, "ENDED", 5, Instant.now());
    활동을_넣는다(먼저, 크루, "IN_PROGRESS", 7, Instant.now());
    jdbcTemplate.update(
        "INSERT INTO follows (follower_id, followee_id) VALUES (?, ?)", 크루장.id(), 나중.id());

    mockMvc
        .perform(get("/api/v1/crew/members").header(HttpHeaders.AUTHORIZATION, 크루장.bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.length()").value(3))
        .andExpect(jsonPath("$.data[0].id").value(크루장.id().toString()))
        .andExpect(jsonPath("$.data[0].isLeader").value(true))
        .andExpect(jsonPath("$.data[1].id").value(먼저.id().toString()))
        .andExpect(jsonPath("$.data[1].totalItems").value(5))
        .andExpect(jsonPath("$.data[1].following").value(false))
        .andExpect(jsonPath("$.data[2].id").value(나중.id().toString()))
        .andExpect(jsonPath("$.data[2].isLeader").value(false))
        .andExpect(jsonPath("$.data[2].following").value(true))
        .andExpect(jsonPath("$.data[2].joinedAt").isNotEmpty());
  }

  @Test
  void 타인_프로필은_누적과_활동한_날을_주고_차단했어도_200_이며_크루원이_아니면_404_다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "profile-leader@test.io");
    String 크루 = 공개_크루를_만든다(크루장);
    TestAccount 상대 = 가입한다(mockMvc, "profile-member@test.io");
    크루에_들어간다(상대, 크루);
    Instant 어제 = Instant.now().minus(1, ChronoUnit.DAYS);
    활동을_넣는다(상대, 크루, "ENDED", 3, 어제);
    활동을_넣는다(상대, 크루, "ENDED", 4, 어제);
    활동을_넣는다(상대, 크루, "ENDED", 9, Instant.now().minus(400, ChronoUnit.DAYS));
    jdbcTemplate.update(
        "INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?)", 크루장.id(), 상대.id());

    mockMvc
        .perform(프로필(크루장, 상대.id()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.totalItems").value(16))
        .andExpect(jsonPath("$.data.totalActivities").value(3))
        .andExpect(jsonPath("$.data.totalDistanceM").value(300))
        .andExpect(jsonPath("$.data.activeDays.length()").value(1))
        .andExpect(jsonPath("$.data.blocked").value(true))
        .andExpect(jsonPath("$.data.isLeader").value(false));

    mockMvc
        .perform(프로필(크루장, 가입한다(mockMvc, "profile-stranger@test.io").id()))
        .andExpect(status().isNotFound());
  }

  @Test
  void 위임하면_leader_id_가_바뀌고_이전_크루장은_크루원이_된다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "delegate-leader@test.io");
    String 크루 = 공개_크루를_만든다(크루장);
    TestAccount 크루원 = 가입한다(mockMvc, "delegate-member@test.io");
    크루에_들어간다(크루원, 크루);

    mockMvc.perform(위임한다(크루장, 크루원.id())).andExpect(status().isNoContent());

    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT leader_id FROM crews WHERE id = ?", UUID.class, UUID.fromString(크루)))
        .isEqualTo(크루원.id());
    mockMvc
        .perform(내_정보(크루장))
        .andExpect(jsonPath("$.data.membership.status").value("MEMBER"))
        .andExpect(jsonPath("$.data.membership.crew.isLeader").value(false));
    mockMvc
        .perform(위임한다(크루장, 크루원.id()))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));
  }

  @Test
  void 크루원이_아닌_사람에게_위임하면_404_자기_자신이면_422_다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "delegate-leader-2@test.io");
    공개_크루를_만든다(크루장);

    mockMvc
        .perform(위임한다(크루장, 가입한다(mockMvc, "delegate-stranger@test.io").id()))
        .andExpect(status().isNotFound());
    mockMvc.perform(위임한다(크루장, 크루장.id())).andExpect(status().isUnprocessableEntity());
  }

  @Test
  void 추방하면_소속이_없어지고_이력이_남아_같은_크루에_가입도_신청도_403_이다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "expel-leader@test.io");
    String 크루 = 공개_크루를_만든다(크루장);
    TestAccount 크루원 = 가입한다(mockMvc, "expel-member@test.io");
    크루에_들어간다(크루원, 크루);

    mockMvc.perform(추방한다(크루장, 크루원.id())).andExpect(status().isNoContent());

    mockMvc.perform(내_정보(크루원)).andExpect(jsonPath("$.data.membership.status").value("NONE"));
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT expelled_by FROM crew_expulsions WHERE crew_id = ? AND user_id = ?",
                UUID.class,
                UUID.fromString(크루),
                크루원.id()))
        .isEqualTo(크루장.id());
    assertThat(events.stream(MemberExpelledEvent.class))
        .containsExactly(new MemberExpelledEvent(UUID.fromString(크루), 크루원.id(), 크루장.id()));

    가입_요청(크루원, 크루)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("EXPELLED_FROM_CREW"));
    mockMvc
        .perform(
            patch("/api/v1/crew")
                .header(HttpHeaders.AUTHORIZATION, 크루장.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"joinPolicy\":\"APPROVAL\"}"))
        .andExpect(status().isOk());
    가입_요청(크루원, 크루)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("EXPELLED_FROM_CREW"));
  }

  @Test
  void 크루원이_추방하면_403_크루원이_아닌_사람은_404_다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "expel-leader-2@test.io");
    String 크루 = 공개_크루를_만든다(크루장);
    TestAccount 크루원 = 가입한다(mockMvc, "expel-member-2@test.io");
    크루에_들어간다(크루원, 크루);

    mockMvc
        .perform(추방한다(크루원, 크루장.id()))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    mockMvc
        .perform(추방한다(크루장, 가입한다(mockMvc, "expel-stranger@test.io").id()))
        .andExpect(status().isNotFound());
    assertThat(크루원_수(크루)).isEqualTo(2);
  }

  @Test
  void 다른_크루원이_있는_크루장이_나가면_403_LEADER_MUST_DELEGATE_다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "leave-leader@test.io");
    String 크루 = 공개_크루를_만든다(크루장);
    크루에_들어간다(가입한다(mockMvc, "leave-member@test.io"), 크루);

    mockMvc
        .perform(나간다(크루장))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("LEADER_MUST_DELEGATE"));
    assertThat(크루원_수(크루)).isEqualTo(2);
  }

  @Test
  void 진행_중인_활동이_있으면_나가기는_409_다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "leave-leader-2@test.io");
    String 크루 = 공개_크루를_만든다(크루장);
    TestAccount 크루원 = 가입한다(mockMvc, "leave-member-2@test.io");
    크루에_들어간다(크루원, 크루);
    활동을_넣는다(크루원, 크루, "IN_PROGRESS", 0, Instant.now());

    mockMvc
        .perform(나간다(크루원))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONFLICT"));
    assertThat(크루원_수(크루)).isEqualTo(2);
  }

  @Test
  void 크루원이_나가면_소속이_없어지고_기록은_남는다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "leave-leader-3@test.io");
    String 크루 = 공개_크루를_만든다(크루장);
    TestAccount 크루원 = 가입한다(mockMvc, "leave-member-3@test.io");
    크루에_들어간다(크루원, 크루);
    활동을_넣는다(크루원, 크루, "ENDED", 2, Instant.now());

    mockMvc.perform(나간다(크루원)).andExpect(status().isNoContent());

    mockMvc.perform(내_정보(크루원)).andExpect(jsonPath("$.data.membership.status").value("NONE"));
    assertThat(크루원_수(크루)).isEqualTo(1);
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM activities WHERE user_id = ?", Integer.class, 크루원.id()))
        .isEqualTo(1);
  }

  @Test
  void 혼자_남은_크루장이_나가면_크루가_소프트_삭제되고_검색_가입에서_빠지며_대기_신청은_취소되고_이름은_다시_쓸_수_있다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "dissolve-leader@test.io");
    String 크루 = 크루를_만든다(크루장, "APPROVAL");
    TestAccount 신청자 = 가입한다(mockMvc, "dissolve-applicant@test.io");
    String 신청 = JsonPath.read(본문(가입_요청(신청자, 크루)), "$.data.id");
    String 이름 =
        jdbcTemplate.queryForObject(
            "SELECT name FROM crews WHERE id = ?", String.class, UUID.fromString(크루));

    mockMvc.perform(나간다(크루장)).andExpect(status().isNoContent());

    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT deleted_at IS NOT NULL FROM crews WHERE id = ?",
                Boolean.class,
                UUID.fromString(크루)))
        .isTrue();
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT status FROM crew_join_requests WHERE id = ?",
                String.class,
                UUID.fromString(신청)))
        .isEqualTo("CANCELED");
    mockMvc.perform(내_정보(크루장)).andExpect(jsonPath("$.data.membership.status").value("NONE"));
    mockMvc.perform(내_정보(신청자)).andExpect(jsonPath("$.data.membership.status").value("NONE"));
    mockMvc
        .perform(
            get("/api/v1/crews").param("query", 이름).header(HttpHeaders.AUTHORIZATION, 신청자.bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items.length()").value(0));
    가입_요청(신청자, 크루).andExpect(status().isNotFound());
    mockMvc
        .perform(
            post("/api/v1/crews")
                .header(HttpHeaders.AUTHORIZATION, 신청자.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"name\":\"%s\",\"region\":\"SEOUL\",\"joinPolicy\":\"OPEN\"}".formatted(이름)))
        .andExpect(status().isCreated());
  }

  private String 공개_크루를_만든다(TestAccount 계정) throws Exception {
    return 크루를_만든다(계정, "OPEN");
  }

  private String 크루를_만든다(TestAccount 계정, String 가입_방식) throws Exception {
    String 이름 = "크루" + UUID.randomUUID().toString().substring(0, 8);
    return JsonPath.read(
        mockMvc
            .perform(
                post("/api/v1/crews")
                    .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        "{\"name\":\"%s\",\"region\":\"SEOUL\",\"joinPolicy\":\"%s\"}"
                            .formatted(이름, 가입_방식)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString(),
        "$.data.id");
  }

  private void 크루에_들어간다(TestAccount 계정, String 크루) throws Exception {
    가입_요청(계정, 크루).andExpect(status().isCreated());
  }

  private ResultActions 가입_요청(TestAccount 계정, String 크루) throws Exception {
    return mockMvc.perform(
        post("/api/v1/crews/join-requests")
            .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"crewId\":\"%s\"}".formatted(크루)));
  }

  private void 닉네임을_바꾼다(TestAccount 계정, String 앞글자) {
    jdbcTemplate.update(
        "UPDATE users SET nickname = ? WHERE id = ?",
        앞글자 + UUID.randomUUID().toString().substring(0, 6),
        계정.id());
  }

  private void 활동을_넣는다(TestAccount 계정, String 크루, String 상태, int 수량, Instant 시작) {
    boolean 끝남 = "ENDED".equals(상태);
    jdbcTemplate.update(
        "INSERT INTO activities (id, user_id, crew_id, status, started_at, ended_at, distance_m,"
            + " location_shared, item_count) VALUES (?, ?, ?, ?, ?, ?, 100, false, ?)",
        UUID.randomUUID(),
        계정.id(),
        UUID.fromString(크루),
        상태,
        java.sql.Timestamp.from(시작),
        끝남 ? java.sql.Timestamp.from(시작.plusSeconds(600)) : null,
        수량);
  }

  private int 크루원_수(String 크루) {
    return jdbcTemplate.queryForObject(
        "SELECT count(*) FROM crew_members WHERE crew_id = ?", Integer.class, UUID.fromString(크루));
  }

  private static String 본문(ResultActions 결과) throws Exception {
    return 결과.andReturn().getResponse().getContentAsString();
  }

  private static MockHttpServletRequestBuilder 프로필(TestAccount 계정, UUID 대상) {
    return get("/api/v1/crew/members/" + 대상).header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private static MockHttpServletRequestBuilder 위임한다(TestAccount 계정, UUID 대상) {
    return put("/api/v1/crew/leader")
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"userId\":\"%s\"}".formatted(대상));
  }

  private static MockHttpServletRequestBuilder 추방한다(TestAccount 계정, UUID 대상) {
    return delete("/api/v1/crew/members/" + 대상).header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private static MockHttpServletRequestBuilder 나간다(TestAccount 계정) {
    return post("/api/v1/crew/leave").header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private static MockHttpServletRequestBuilder 내_정보(TestAccount 계정) {
    return get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }
}
