package site.gachijoopging.server.domain.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts;

@AutoConfigureMockMvc
class AuthRefreshLogoutTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private JdbcTemplate jdbcTemplate;

  @Test
  void 회전하면_새_토큰_쌍이_나온다() throws Exception {
    String 옛_refresh = 가입한다("rotate@test.io").get("refreshToken").asText();

    mockMvc
        .perform(refresh(옛_refresh))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
        .andExpect(jsonPath("$.data.refreshToken").isNotEmpty())
        .andExpect(jsonPath("$.data.refreshToken").value(org.hamcrest.Matchers.not(옛_refresh)));
  }

  @Test
  void 회전한_뒤_옛_refreshToken_은_거부된다() throws Exception {
    String 옛_refresh = 가입한다("reuse@test.io").get("refreshToken").asText();
    mockMvc.perform(refresh(옛_refresh)).andExpect(status().isOk());

    mockMvc.perform(refresh(옛_refresh)).andExpect(status().isUnauthorized());
  }

  @Test
  void 재사용이_탐지되면_그_family_전체가_끊긴다() throws Exception {
    String 옛_refresh = 가입한다("family@test.io").get("refreshToken").asText();
    String 새_refresh =
        본문(mockMvc.perform(refresh(옛_refresh)).andExpect(status().isOk()))
            .get("refreshToken")
            .asText();

    mockMvc.perform(refresh(옛_refresh)).andExpect(status().isUnauthorized());

    mockMvc.perform(refresh(새_refresh)).andExpect(status().isUnauthorized());
  }

  @Test
  void 회전해도_family_id_는_유지된다() throws Exception {
    String refresh = 가입한다("same-family@test.io").get("refreshToken").asText();
    mockMvc.perform(refresh(refresh)).andExpect(status().isOk());

    Integer family수 =
        jdbcTemplate.queryForObject(
            """
            SELECT count(DISTINCT t.family_id) FROM refresh_tokens t
            JOIN users u ON u.id = t.user_id WHERE u.email = 'same-family@test.io'
            """,
            Integer.class);

    assertThat(family수).isEqualTo(1);
  }

  @Test
  void 모르는_refreshToken_은_401_이다() throws Exception {
    mockMvc.perform(refresh("존재하지-않는-토큰")).andExpect(status().isUnauthorized());
  }

  @Test
  void logout_은_보낸_토큰만_끊는다() throws Exception {
    String 기기A = 가입한다("two-devices@test.io").get("refreshToken").asText();
    String 기기B = 로그인한다("two-devices@test.io").get("refreshToken").asText();

    mockMvc.perform(logout(기기A)).andExpect(status().isNoContent());
    assertThat(
            jdbcTemplate.queryForObject(
                "SELECT count(*) FROM refresh_tokens t JOIN users u ON u.id = t.user_id"
                    + " WHERE u.email = 'two-devices@test.io'",
                Integer.class))
        .isOne();

    mockMvc.perform(refresh(기기A)).andExpect(status().isUnauthorized());
    mockMvc.perform(refresh(기기B)).andExpect(status().isOk());
  }

  @Test
  void logout_은_refreshToken_없이도_성공한다() throws Exception {
    mockMvc
        .perform(post("/api/v1/auth/logout").contentType(MediaType.APPLICATION_JSON).content("{}"))
        .andExpect(status().isNoContent());
  }

  @Test
  void 로그아웃에_푸시토큰을_주면_내_기기_토큰이_지워진다() throws Exception {
    JsonNode 나 = 가입한다("push-mine@test.io");
    기기를_등록한다(나, "push-mine");

    mockMvc
        .perform(logout(나.get("refreshToken").asText(), "push-mine"))
        .andExpect(status().isNoContent());

    assertThat(기기_주인("push-mine")).isEmpty();
  }

  @Test
  void 남의_푸시토큰은_지우지_않는다() throws Exception {
    JsonNode 남 = 가입한다("push-owner@test.io");
    기기를_등록한다(남, "push-others");
    JsonNode 나 = 가입한다("push-thief@test.io");

    mockMvc
        .perform(logout(나.get("refreshToken").asText(), "push-others"))
        .andExpect(status().isNoContent());

    assertThat(기기_주인("push-others")).containsExactly("push-owner@test.io");
  }

  @Test
  void 회전된_옛_refreshToken_으로는_지금_기기_토큰을_지우지_않는다() throws Exception {
    JsonNode 나 = 가입한다("push-stale@test.io");
    String 옛_refresh = 나.get("refreshToken").asText();
    JsonNode 새_세션 = 본문(mockMvc.perform(refresh(옛_refresh)).andExpect(status().isOk()));
    기기를_등록한다(새_세션, "push-current");

    mockMvc.perform(logout(옛_refresh, "push-current")).andExpect(status().isNoContent());

    assertThat(기기_주인("push-current")).containsExactly("push-stale@test.io");
  }

  @Test
  void 푸시토큰_없이도_로그아웃된다() throws Exception {
    JsonNode 나 = 가입한다("push-none@test.io");
    기기를_등록한다(나, "push-kept");

    mockMvc.perform(logout(나.get("refreshToken").asText())).andExpect(status().isNoContent());

    mockMvc.perform(refresh(나.get("refreshToken").asText())).andExpect(status().isUnauthorized());
    assertThat(기기_주인("push-kept")).containsExactly("push-none@test.io");
  }

  private void 기기를_등록한다(JsonNode 계정, String pushToken) throws Exception {
    mockMvc
        .perform(
            put("/api/v1/users/me/devices")
                .header("Authorization", "Bearer " + 계정.get("accessToken").asText())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"pushToken\":\"%s\",\"platform\":\"ANDROID\"}".formatted(pushToken)))
        .andExpect(status().isNoContent());
  }

  private java.util.List<String> 기기_주인(String pushToken) {
    return jdbcTemplate.queryForList(
        "SELECT u.email FROM devices d JOIN users u ON u.id = d.user_id WHERE d.push_token = ?",
        String.class,
        pushToken);
  }

  private JsonNode 가입한다(String 이메일) throws Exception {
    return 본문(
        mockMvc
            .perform(
                post("/api/v1/auth/signup")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(TestAccounts.가입_본문(이메일)))
            .andExpect(status().isCreated()));
  }

  private JsonNode 로그인한다(String 이메일) throws Exception {
    return 본문(
        mockMvc
            .perform(
                post("/api/v1/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"email\":\"%s\",\"password\":\"password123\"}".formatted(이메일)))
            .andExpect(status().isOk()));
  }

  private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder refresh(
      String token) {
    return post("/api/v1/auth/refresh")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"refreshToken\":\"%s\"}".formatted(token));
  }

  private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder logout(
      String token) {
    return post("/api/v1/auth/logout")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"refreshToken\":\"%s\"}".formatted(token));
  }

  private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder logout(
      String token, String pushToken) {
    return post("/api/v1/auth/logout")
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"refreshToken\":\"%s\",\"pushToken\":\"%s\"}".formatted(token, pushToken));
  }

  private JsonNode 본문(org.springframework.test.web.servlet.ResultActions actions) throws Exception {
    return objectMapper
        .readTree(actions.andReturn().getResponse().getContentAsString())
        .get("data");
  }
}
