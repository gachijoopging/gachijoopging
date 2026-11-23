package site.gachijoopging.server.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

public final class TestAccounts {

  private TestAccounts() {}

  public record TestAccount(UUID id, String accessToken) {

    public String bearer() {
      return "Bearer " + accessToken;
    }
  }

  public static TestAccount 가입한다(MockMvc mockMvc, String 이메일) throws Exception {
    String 응답 =
        mockMvc
            .perform(
                post("/api/v1/auth/signup")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(가입_본문(이메일)))
            .andReturn()
            .getResponse()
            .getContentAsString();
    String accessToken = JsonPath.read(응답, "$.data.accessToken");
    return new TestAccount(UUID.fromString(내_id(mockMvc, accessToken)), accessToken);
  }

  // 토큰 응답에는 사용자 id 가 없다 — 앱처럼 GET /users/me 로 받는다
  public static String 내_id(MockMvc mockMvc, String accessToken) throws Exception {
    return JsonPath.read(
        mockMvc
            .perform(
                get("/api/v1/users/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
            .andReturn()
            .getResponse()
            .getContentAsString(),
        "$.data.id");
  }

  // 닉네임은 DB 전체에서 유일해야 하고, 테스트 클래스들이 컨테이너 하나를 같이 쓴다
  public static String 가입_본문(String 이메일) {
    return "{\"email\":\"%s\",\"password\":\"password123\",\"nickname\":\"%s\"}"
        .formatted(이메일, 고유_닉네임());
  }

  public static String 고유_닉네임() {
    return "t" + UUID.randomUUID().toString().substring(0, 8);
  }
}
