package site.gachijoopging.server.global.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.global.config.WebConfig;
import site.gachijoopging.server.global.web.NoApiPrefix;

@WebMvcTest(controllers = {SecurityConfigTest.탐침_컨트롤러.class, SecurityConfigTest.웹훅_탐침_컨트롤러.class})
@Import({
  WebConfig.class,
  SecurityConfig.class,
  JwtAuthenticationFilter.class,
  SecurityConfigTest.탐침_컨트롤러.class,
  SecurityConfigTest.웹훅_탐침_컨트롤러.class
})
class SecurityConfigTest {

  @MockitoBean private site.gachijoopging.server.global.security.jwt.JwtVerifier jwtVerifier;

  @MockitoBean private AccountAuthorityLoader accountAuthorityLoader;

  @Autowired private MockMvc mockMvc;

  @Test
  void 개방_경로는_인증_없이_통과한다() throws Exception {
    mockMvc.perform(get("/api/v1/auth/probe")).andExpect(status().isOk());
  }

  @Test
  void 개방_경로가_아니면_거부된다() throws Exception {
    mockMvc
        .perform(get("/api/v1/meets"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("TOKEN_EXPIRED"));
  }

  @Test
  void 개방_경로의_POST_는_CSRF_토큰_없이_통과한다() throws Exception {
    mockMvc.perform(post("/api/v1/auth/probe")).andExpect(status().isOk());
  }

  @Test
  void livekit_웹훅은_인증_없이_통과한다() throws Exception {
    mockMvc.perform(post("/livekit/webhook")).andExpect(status().isOk());
  }

  @RestController
  static class 탐침_컨트롤러 {

    @GetMapping("/auth/probe")
    String get() {
      return "ok";
    }

    @PostMapping("/auth/probe")
    String post() {
      return "ok";
    }
  }

  @NoApiPrefix
  @RestController
  static class 웹훅_탐침_컨트롤러 {

    @PostMapping("/livekit/webhook")
    String 웹훅() {
      return "ok";
    }
  }
}
