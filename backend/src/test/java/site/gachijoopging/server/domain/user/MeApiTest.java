package site.gachijoopging.server.domain.user;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static site.gachijoopging.server.support.TestAccounts.가입한다;

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
class MeApiTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;

  @Test
  void 가입_직후_내_정보는_닉네임_전이고_소속이_없다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "me-fresh@test.io");

    mockMvc
        .perform(get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, 나.bearer()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.id").value(나.id().toString()))
        .andExpect(jsonPath("$.data.profileComplete").value(false))
        .andExpect(jsonPath("$.data.nickname").isEmpty())
        .andExpect(jsonPath("$.data.email").value("me-fresh@test.io"))
        .andExpect(jsonPath("$.data.hasPassword").value(true))
        .andExpect(jsonPath("$.data.linked.kakao").value(false))
        .andExpect(jsonPath("$.data.settings.shareLocationDefault").value(true))
        .andExpect(jsonPath("$.data.membership.status").value("NONE"))
        .andExpect(jsonPath("$.data.membership.crew").isEmpty());
  }

  @Test
  void 닉네임을_저장하면_프로필이_완료된다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "me-nick@test.io");

    mockMvc
        .perform(수정(나, "{\"nickname\":\"새싹줍깅러\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.nickname").value("새싹줍깅러"))
        .andExpect(jsonPath("$.data.profileComplete").value(true));
  }

  @Test
  void 보내지_않은_항목은_그대로다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "me-partial@test.io");
    mockMvc.perform(수정(나, "{\"nickname\":\"부분수정\",\"intro\":\"한강 담당\"}"));

    mockMvc
        .perform(수정(나, "{\"notifyActivityStart\":false}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.nickname").value("부분수정"))
        .andExpect(jsonPath("$.data.intro").value("한강 담당"))
        .andExpect(jsonPath("$.data.settings.notifyActivityStart").value(false));
  }

  @Test
  void 남이_쓰는_닉네임은_409_NICKNAME_TAKEN_이다() throws Exception {
    mockMvc.perform(수정(가입한다(mockMvc, "me-dup-a@test.io"), "{\"nickname\":\"겹치는이름\"}"));
    TestAccount 나 = 가입한다(mockMvc, "me-dup-b@test.io");

    mockMvc
        .perform(수정(나, "{\"nickname\":\"겹치는이름\"}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("NICKNAME_TAKEN"));
  }

  @Test
  void 내_닉네임을_다시_보내도_200이다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "me-same@test.io");
    mockMvc.perform(수정(나, "{\"nickname\":\"같은이름\"}"));

    mockMvc.perform(수정(나, "{\"nickname\":\"같은이름\"}")).andExpect(status().isOk());
  }

  @Test
  void 닉네임_13자는_422_다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "me-long@test.io");

    mockMvc
        .perform(수정(나, "{\"nickname\":\"가나다라마바사아자차카타파\"}"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION"));
  }

  @Test
  void 남의_사진은_프로필에_쓸_수_없다() throws Exception {
    TestAccount 남 = 가입한다(mockMvc, "me-photo-other@test.io");
    UUID 남의_사진 = 사진을_만든다(남.id());
    TestAccount 나 = 가입한다(mockMvc, "me-photo@test.io");

    mockMvc
        .perform(수정(나, "{\"photoMediaId\":\"" + 남의_사진 + "\"}"))
        .andExpect(status().isUnprocessableEntity());
  }

  @Test
  void 사진을_null_로_보내면_지워진다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "me-photo-clear@test.io");
    UUID 내_사진 = 사진을_만든다(나.id());
    mockMvc
        .perform(수정(나, "{\"photoMediaId\":\"" + 내_사진 + "\"}"))
        .andExpect(jsonPath("$.data.photoUrl").isNotEmpty());

    mockMvc
        .perform(수정(나, "{\"photoMediaId\":null}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.photoUrl").isEmpty());
  }

  @Test
  void 토큰이_없으면_401_이다() throws Exception {
    mockMvc.perform(get("/api/v1/users/me")).andExpect(status().isUnauthorized());
  }

  private MockHttpServletRequestBuilder 수정(TestAccount 나, String 본문) {
    return patch("/api/v1/users/me")
        .header(HttpHeaders.AUTHORIZATION, 나.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content(본문);
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
}
