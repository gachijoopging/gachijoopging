package site.gachijoopging.server.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.jayway.jsonpath.JsonPath;
import java.util.UUID;
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
                    .content("{\"email\":\"%s\",\"password\":\"password123\"}".formatted(이메일)))
            .andReturn()
            .getResponse()
            .getContentAsString();

    return new TestAccount(
        UUID.fromString(JsonPath.read(응답, "$.data.user.id")),
        JsonPath.read(응답, "$.data.accessToken"));
  }
}
