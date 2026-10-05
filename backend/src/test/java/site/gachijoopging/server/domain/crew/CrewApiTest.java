package site.gachijoopging.server.domain.crew;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static site.gachijoopging.server.support.TestAccounts.가입한다;

import com.jayway.jsonpath.JsonPath;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts.TestAccount;

@AutoConfigureMockMvc
class CrewApiTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;

  @Test
  void 만든_사람이_크루장이고_GET_crew_가_같은_크루를_돌려준다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "crew-create@test.io");

    String 응답 =
        mockMvc
            .perform(만든다(나, "  한강줍깅크루 "))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.data.name").value("한강줍깅크루"))
            .andExpect(jsonPath("$.data.leader.id").value(나.id().toString()))
            .andExpect(jsonPath("$.data.memberCount").value(1))
            .andExpect(jsonPath("$.data.goalCount").value(200))
            .andExpect(
                jsonPath("$.data.inviteCode")
                    .value(
                        org.hamcrest.Matchers.matchesRegex(
                            "^[A-HJ-NP-Z2-9]{2}-[A-HJ-NP-Z2-9]{4}$")))
            .andExpect(jsonPath("$.data.isLeader").value(true))
            .andExpect(jsonPath("$.data.pinnedNotice").isEmpty())
            .andReturn()
            .getResponse()
            .getContentAsString();

    mockMvc
        .perform(get("/api/v1/crew").header(HttpHeaders.AUTHORIZATION, 나.bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.id").value(JsonPath.<String>read(응답, "$.data.id")))
        .andExpect(jsonPath("$.data.isLeader").value(true));
  }

  @Test
  void 크루를_만들면_내_정보의_소속이_MEMBER_다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "crew-me@test.io");
    String 크루_id =
        크루_id(mockMvc.perform(만든다(나, "소속확인크루")).andReturn().getResponse().getContentAsString());

    mockMvc
        .perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, 나.bearer()))
        .andExpect(jsonPath("$.data.membership.status").value("MEMBER"))
        .andExpect(jsonPath("$.data.membership.crew.id").value(크루_id))
        .andExpect(jsonPath("$.data.membership.crew.name").value("소속확인크루"))
        .andExpect(jsonPath("$.data.membership.crew.isLeader").value(true));
  }

  @Test
  void 소속이_없으면_crew_경로는_403_NO_CREW_다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "crew-none@test.io");

    mockMvc
        .perform(get("/api/v1/crew").header(HttpHeaders.AUTHORIZATION, 나.bearer()))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("NO_CREW"));
  }

  @Test
  void 크루원이_수정하면_403_FORBIDDEN_이고_크루장은_된다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "crew-leader@test.io");
    String 크루_id =
        크루_id(mockMvc.perform(만든다(크루장, "수정권한크루")).andReturn().getResponse().getContentAsString());
    TestAccount 크루원 = 가입한다(mockMvc, "crew-member@test.io");
    소속시킨다(크루원, 크루_id);

    mockMvc
        .perform(수정(크루원, "{\"intro\":\"몰래 수정\"}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));

    mockMvc
        .perform(수정(크루장, "{\"intro\":\"매주 토요일 아침\",\"goalCount\":300}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.intro").value("매주 토요일 아침"))
        .andExpect(jsonPath("$.data.goalCount").value(300))
        .andExpect(jsonPath("$.data.memberCount").value(2));

    mockMvc
        .perform(get("/api/v1/crew").header(HttpHeaders.AUTHORIZATION, 크루원.bearer()))
        .andExpect(jsonPath("$.data.isLeader").value(false))
        .andExpect(jsonPath("$.data.pendingJoinRequests").value(0));
  }

  @Test
  void 초대_코드로_미리_보면_대소문자와_하이픈을_가리지_않는다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "crew-preview-leader@test.io");
    String 응답 = mockMvc.perform(만든다(크루장, "미리보기크루")).andReturn().getResponse().getContentAsString();
    String 코드 = JsonPath.read(응답, "$.data.inviteCode");
    TestAccount 가입_희망자 = 가입한다(mockMvc, "crew-preview-guest@test.io");

    mockMvc
        .perform(
            get("/api/v1/crews/preview")
                .param("inviteCode", 코드.replace("-", "").toLowerCase())
                .header(HttpHeaders.AUTHORIZATION, 가입_희망자.bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.id").value(JsonPath.<String>read(응답, "$.data.id")))
        .andExpect(jsonPath("$.data.name").value("미리보기크루"))
        .andExpect(jsonPath("$.data.memberCount").value(1))
        .andExpect(jsonPath("$.data.leader.withdrawn").value(false));
  }

  @Test
  void 없는_초대_코드는_404_형식이_틀리면_422_다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "crew-preview-bad@test.io");

    mockMvc
        .perform(미리보기(나, "ZZ-ZZZZ"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    mockMvc
        .perform(미리보기(나, "ZZ-ZZ"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION"));
  }

  @Test
  void 이미_소속이면_409_ALREADY_IN_CREW_다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "crew-twice@test.io");
    mockMvc.perform(만든다(나, "첫번째크루"));

    mockMvc
        .perform(만든다(나, "두번째크루"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ALREADY_IN_CREW"));
  }

  @Test
  void 같은_이름은_앞뒤_공백을_빼고_비교해_409_CREW_NAME_TAKEN_이다() throws Exception {
    mockMvc.perform(만든다(가입한다(mockMvc, "crew-dup-a@test.io"), "겹치는크루"));

    mockMvc
        .perform(만든다(가입한다(mockMvc, "crew-dup-b@test.io"), " 겹치는크루\n"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CREW_NAME_TAKEN"));
  }

  @Test
  void 공백을_빼고_두_글자가_안_되면_422_다() throws Exception {
    mockMvc
        .perform(만든다(가입한다(mockMvc, "crew-short@test.io"), "  a  "))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION"));
  }

  @Test
  void 사진을_보내지_않으면_크루_사진은_그대로다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "crew-photo-keep@test.io");
    mockMvc.perform(만든다(크루장, "사진유지크루"));
    UUID 사진 = 사진을_만든다(크루장.id());
    mockMvc.perform(수정(크루장, "{\"photoMediaId\":\"" + 사진 + "\"}"));

    mockMvc
        .perform(수정(크루장, "{\"intro\":\"사진은 그대로\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.photoUrl").isNotEmpty());

    mockMvc
        .perform(수정(크루장, "{\"photoMediaId\":null}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.photoUrl").isEmpty());
  }

  @Test
  void 남의_크루_이름으로_바꾸면_409_CREW_NAME_TAKEN_이다() throws Exception {
    mockMvc.perform(만든다(가입한다(mockMvc, "crew-rename-a@test.io"), "먼저쓴이름"));
    TestAccount 크루장 = 가입한다(mockMvc, "crew-rename-b@test.io");
    mockMvc.perform(만든다(크루장, "나중이름"));

    mockMvc
        .perform(수정(크루장, "{\"name\":\" 먼저쓴이름 \"}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CREW_NAME_TAKEN"));
  }

  @Test
  void 크루장이_탈퇴했으면_미리보기의_크루장은_탈퇴한_크루원이다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "crew-withdrawn-leader@test.io");
    String 코드 =
        JsonPath.read(
            mockMvc.perform(만든다(크루장, "탈퇴확인크루")).andReturn().getResponse().getContentAsString(),
            "$.data.inviteCode");
    jdbcTemplate.update("UPDATE users SET status = 'DELETED' WHERE id = ?", 크루장.id());

    mockMvc
        .perform(미리보기(가입한다(mockMvc, "crew-withdrawn-guest@test.io"), 코드))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.leader.withdrawn").value(true))
        .andExpect(jsonPath("$.data.leader.nickname").value("탈퇴한 크루원"));
  }

  private UUID 사진을_만든다(UUID 주인) {
    UUID id = UUID.randomUUID();
    jdbcTemplate.update(
        "INSERT INTO media (id, owner_id, object_key, thumb_key) VALUES (?, ?, ?, ?)",
        id,
        주인,
        "o/" + id,
        "t/" + id);
    return id;
  }

  private static MockHttpServletRequestBuilder 만든다(TestAccount 계정, String 이름) {
    return post("/api/v1/crews")
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"name\":%s}".formatted(json문자열(이름)));
  }

  private static MockHttpServletRequestBuilder 수정(TestAccount 계정, String 본문) {
    return patch("/api/v1/crew")
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content(본문);
  }

  private static MockHttpServletRequestBuilder 미리보기(TestAccount 계정, String 코드) {
    return get("/api/v1/crews/preview")
        .param("inviteCode", 코드)
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private void 소속시킨다(TestAccount 계정, String 크루_id) {
    jdbcTemplate.update(
        "INSERT INTO crew_members (crew_id, user_id, joined_at) VALUES (?, ?, ?)",
        UUID.fromString(크루_id),
        계정.id(),
        Timestamp.from(Instant.now()));
  }

  private static String 크루_id(String 응답) {
    return JsonPath.read(응답, "$.data.id");
  }

  private static String json문자열(String 값) {
    return "\"" + 값.replace("\n", "\\n") + "\"";
  }
}
