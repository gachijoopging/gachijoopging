package site.gachijoopging.server.domain.crew;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static site.gachijoopging.server.support.TestAccounts.가입한다;

import com.jayway.jsonpath.JsonPath;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
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
            .andExpect(jsonPath("$.data.intro").value(""))
            .andExpect(jsonPath("$.data.region").value("SEOUL"))
            .andExpect(jsonPath("$.data.joinPolicy").value("APPROVAL"))
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
  void 활동_지역이나_가입_방식이_없으면_422_다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "crew-missing-policy@test.io");

    mockMvc
        .perform(만든다(나, "{\"name\":\"지역없는크루\",\"joinPolicy\":\"OPEN\"}"))
        .andExpect(status().isUnprocessableEntity());
    mockMvc
        .perform(만든다(나, "{\"name\":\"방식없는크루\",\"region\":\"SEOUL\"}"))
        .andExpect(status().isUnprocessableEntity());
    mockMvc
        .perform(만든다(나, "{\"name\":\"틀린지역크루\",\"region\":\"MARS\",\"joinPolicy\":\"OPEN\"}"))
        .andExpect(status().isUnprocessableEntity());
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
  void 크루장이_탈퇴했으면_검색의_크루장은_탈퇴한_크루원이다() throws Exception {
    TestAccount 크루장 = 가입한다(mockMvc, "crew-withdrawn-leader@test.io");
    mockMvc.perform(만든다(크루장, "탈퇴확인크루"));
    jdbcTemplate.update("UPDATE users SET status = 'DELETED' WHERE id = ?", 크루장.id());

    mockMvc
        .perform(검색(가입한다(mockMvc, "crew-withdrawn-guest@test.io")).param("query", "탈퇴확인크루"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items[0].leader.withdrawn").value(true))
        .andExpect(jsonPath("$.data.items[0].leader.nickname").value("탈퇴한 크루원"));
  }

  @Test
  void 검색은_이름_부분_일치를_대소문자_없이_이름순으로_커서로_준다() throws Exception {
    mockMvc.perform(만든다(가입한다(mockMvc, "crew-search-a@test.io"), "SrchTest-A"));
    mockMvc.perform(만든다(가입한다(mockMvc, "crew-search-b@test.io"), "srchtest-b"));
    TestAccount 나 = 가입한다(mockMvc, "crew-search-me@test.io");

    String 첫_페이지 =
        mockMvc
            .perform(검색(나).param("query", "SRCHTEST").param("limit", "1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.items.length()").value(1))
            .andExpect(jsonPath("$.data.items[0].name").value("SrchTest-A"))
            .andExpect(jsonPath("$.data.items[0].memberCount").value(1))
            .andExpect(jsonPath("$.data.items[0].region").value("SEOUL"))
            .andExpect(jsonPath("$.data.items[0].joinPolicy").value("APPROVAL"))
            .andReturn()
            .getResponse()
            .getContentAsString();

    mockMvc
        .perform(
            검색(나)
                .param("query", "SRCHTEST")
                .param("limit", "1")
                .param("cursor", JsonPath.<String>read(첫_페이지, "$.data.nextCursor")))
        .andExpect(jsonPath("$.data.items[0].name").value("srchtest-b"))
        .andExpect(jsonPath("$.data.nextCursor").isEmpty());
  }

  @Test
  void 검색어의_퍼센트는_와일드카드가_아니다() throws Exception {
    mockMvc.perform(만든다(가입한다(mockMvc, "crew-search-pct@test.io"), "퍼센트없는크루"));

    mockMvc
        .perform(검색(가입한다(mockMvc, "crew-search-pct-me@test.io")).param("query", "%"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items[?(@.name == '퍼센트없는크루')]").isEmpty());
  }

  @Test
  void 검색은_활동_지역이_같은_크루만_준다() throws Exception {
    mockMvc.perform(
        만든다(
            가입한다(mockMvc, "crew-search-jeju@test.io"),
            "{\"name\":\"지역검색제주\",\"region\":\"JEJU\",\"joinPolicy\":\"OPEN\"}"));
    mockMvc.perform(만든다(가입한다(mockMvc, "crew-search-seoul@test.io"), "지역검색서울"));
    TestAccount 나 = 가입한다(mockMvc, "crew-search-region-me@test.io");

    mockMvc
        .perform(검색(나).param("query", "지역검색").param("region", "JEJU"))
        .andExpect(jsonPath("$.data.items.length()").value(1))
        .andExpect(jsonPath("$.data.items[0].name").value("지역검색제주"))
        .andExpect(jsonPath("$.data.items[0].joinPolicy").value("OPEN"));
  }

  @Test
  void 조건이_없으면_전체_크루를_이름순으로_준다() throws Exception {
    mockMvc.perform(만든다(가입한다(mockMvc, "crew-search-all@test.io"), "전체검색크루"));

    String 응답 =
        mockMvc
            .perform(검색(가입한다(mockMvc, "crew-search-all-me@test.io")).param("limit", "50"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();

    List<String> 이름 = JsonPath.read(응답, "$.data.items[*].name");
    assertThat(이름).isNotEmpty();
    List<String> 정렬 =
        jdbcTemplate.queryForList(
            "SELECT name FROM crews WHERE deleted_at IS NULL ORDER BY name LIMIT 50", String.class);
    assertThat(이름).containsExactlyElementsOf(정렬);
  }

  @Test
  void 소속이면_검색은_409_ALREADY_IN_CREW_다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "crew-search-member@test.io");
    mockMvc.perform(만든다(나, "검색소속크루"));

    mockMvc
        .perform(검색(나))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ALREADY_IN_CREW"));
  }

  @Test
  void 초대_코드_경로는_없다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "crew-no-invite@test.io");
    mockMvc.perform(만든다(나, "초대없는크루"));

    mockMvc
        .perform(
            get("/api/v1/crews/preview")
                .param("inviteCode", "AB-CDEF")
                .header(HttpHeaders.AUTHORIZATION, 나.bearer()))
        .andExpect(status().isNotFound());
    mockMvc
        .perform(post("/api/v1/crew/invite-code").header(HttpHeaders.AUTHORIZATION, 나.bearer()))
        .andExpect(status().isNotFound());
  }

  private UUID 사진을_만든다(UUID 주인) {
    UUID id = UUID.randomUUID();
    jdbcTemplate.update(
        "INSERT INTO media (id, owner_id, purpose, object_key, thumb_key) VALUES (?, ?, 'CREW', ?, ?)",
        id,
        주인,
        "o/" + id,
        "t/" + id);
    return id;
  }

  private static MockHttpServletRequestBuilder 만든다(TestAccount 계정, String 이름_또는_본문) {
    String 본문 =
        이름_또는_본문.startsWith("{")
            ? 이름_또는_본문
            : "{\"name\":%s,\"region\":\"SEOUL\",\"joinPolicy\":\"APPROVAL\"}"
                .formatted(json문자열(이름_또는_본문));
    return post("/api/v1/crews")
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content(본문);
  }

  private static MockHttpServletRequestBuilder 검색(TestAccount 계정) {
    return get("/api/v1/crews").header(HttpHeaders.AUTHORIZATION, 계정.bearer());
  }

  private static MockHttpServletRequestBuilder 수정(TestAccount 계정, String 본문) {
    return patch("/api/v1/crew")
        .header(HttpHeaders.AUTHORIZATION, 계정.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content(본문);
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
