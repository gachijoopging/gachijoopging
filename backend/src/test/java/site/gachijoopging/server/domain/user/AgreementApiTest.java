package site.gachijoopging.server.domain.user;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static site.gachijoopging.server.support.TestAccounts.가입한다;

import com.jayway.jsonpath.JsonPath;
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
class AgreementApiTest extends IntegrationTest {

  private static final String 전부_동의 =
      """
      {"items":[
        {"type":"TERMS","version":"2026-10","agreed":true},
        {"type":"PRIVACY","version":"2026-10","agreed":true},
        {"type":"MARKETING","version":"2026-10","agreed":true}]}
      """;

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;

  @Test
  void 가입_전_동의_목록은_인증_없이_현재_버전과_URL_을_준다() throws Exception {
    mockMvc
        .perform(get("/api/v1/agreements"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.items.length()").value(3))
        .andExpect(jsonPath("$.data.items[0].type").value("TERMS"))
        .andExpect(jsonPath("$.data.items[0].version").value("2026-10"))
        .andExpect(jsonPath("$.data.items[0].required").value(true))
        .andExpect(jsonPath("$.data.items[0].url").value("https://legal.test/terms"))
        .andExpect(jsonPath("$.data.items[1].type").value("PRIVACY"))
        .andExpect(jsonPath("$.data.items[2].type").value("MARKETING"))
        .andExpect(jsonPath("$.data.items[2].required").value(false))
        .andExpect(jsonPath("$.data.items[0].agreed").doesNotExist());
  }

  @Test
  void 아무것도_동의하지_않은_사용자는_미완료다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "agree-fresh@test.io");

    mockMvc
        .perform(조회(나))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.complete").value(false))
        .andExpect(jsonPath("$.data.items[0].agreed").value(false))
        .andExpect(jsonPath("$.data.items[0].agreedAt").isEmpty());
  }

  @Test
  void 마케팅만_보내_철회해도_필수_동의는_남는다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "agree-partial@test.io");
    mockMvc
        .perform(저장(나, 전부_동의))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.complete").value(true));

    mockMvc
        .perform(
            저장(
                나,
                "{\"items\":[{\"type\":\"MARKETING\",\"version\":\"2026-10\",\"agreed\":false}]}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.complete").value(true))
        .andExpect(jsonPath("$.data.items[0].agreed").value(true))
        .andExpect(jsonPath("$.data.items[1].agreed").value(true))
        .andExpect(jsonPath("$.data.items[2].agreed").value(false))
        .andExpect(jsonPath("$.data.items[2].agreedAt").isEmpty());
  }

  @Test
  void 같은_내용을_다시_보내면_200_이고_동의_시각이_바뀌지_않는다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "agree-resend@test.io");
    String 처음 = mockMvc.perform(저장(나, 전부_동의)).andReturn().getResponse().getContentAsString();

    mockMvc
        .perform(저장(나, 전부_동의))
        .andExpect(status().isOk())
        .andExpect(
            jsonPath("$.data.items[0].agreedAt")
                .value((String) JsonPath.read(처음, "$.data.items[0].agreedAt")));
  }

  @Test
  void 현재_버전이_아니면_422_이고_아무것도_저장하지_않는다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "agree-old@test.io");

    mockMvc
        .perform(
            저장(
                나,
                """
                {"items":[
                  {"type":"TERMS","version":"2026-10","agreed":true},
                  {"type":"PRIVACY","version":"2025-01","agreed":true}]}
                """))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION"))
        .andExpect(jsonPath("$.fields[0].field").value("items"))
        .andExpect(jsonPath("$.fields[0].code").value("FORMAT"));

    mockMvc.perform(조회(나)).andExpect(jsonPath("$.data.items[0].agreed").value(false));
  }

  @Test
  void 같은_항목이_두_번_오면_422_이고_아무것도_저장하지_않는다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "agree-dup@test.io");

    mockMvc
        .perform(
            저장(
                나,
                """
                {"items":[
                  {"type":"MARKETING","version":"2026-10","agreed":true},
                  {"type":"MARKETING","version":"2026-10","agreed":false}]}
                """))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION"))
        .andExpect(jsonPath("$.fields[0].field").value("items"))
        .andExpect(jsonPath("$.fields[0].code").value("FORMAT"));

    mockMvc.perform(조회(나)).andExpect(jsonPath("$.data.items[2].agreed").value(false));
  }

  @Test
  void 필수_항목은_PUT_으로_철회할_수_없다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "agree-required-off@test.io");
    mockMvc.perform(저장(나, 전부_동의));

    mockMvc
        .perform(
            저장(나, "{\"items\":[{\"type\":\"TERMS\",\"version\":\"2026-10\",\"agreed\":false}]}"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.fields[0].field").value("items"))
        .andExpect(jsonPath("$.fields[0].code").value("FORMAT"));
  }

  @Test
  void 옛_버전에만_동의했으면_버전이_오른_뒤_미완료다() throws Exception {
    TestAccount 나 = 가입한다(mockMvc, "agree-bumped@test.io");
    jdbcTemplate.update(
        """
        INSERT INTO user_agreements (user_id, type, version, agreed, agreed_at)
        VALUES (?, 'TERMS', '2025-01', true, now()), (?, 'PRIVACY', '2025-01', true, now())
        """,
        나.id(),
        나.id());

    mockMvc
        .perform(조회(나))
        .andExpect(jsonPath("$.data.complete").value(false))
        .andExpect(jsonPath("$.data.items[0].version").value("2026-10"))
        .andExpect(jsonPath("$.data.items[0].agreed").value(false));
  }

  private static MockHttpServletRequestBuilder 조회(TestAccount 나) {
    return get("/api/v1/users/me/agreements").header(HttpHeaders.AUTHORIZATION, 나.bearer());
  }

  private static MockHttpServletRequestBuilder 저장(TestAccount 나, String 본문) {
    return put("/api/v1/users/me/agreements")
        .header(HttpHeaders.AUTHORIZATION, 나.bearer())
        .contentType(MediaType.APPLICATION_JSON)
        .content(본문);
  }
}
