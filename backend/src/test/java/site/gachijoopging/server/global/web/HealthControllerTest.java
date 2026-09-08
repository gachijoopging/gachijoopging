package site.gachijoopging.server.global.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import site.gachijoopging.server.global.config.WebConfig;
import site.gachijoopging.server.global.error.GlobalExceptionHandler;
import site.gachijoopging.server.global.security.AccountAuthorityLoader;
import site.gachijoopging.server.global.security.SecurityConfig;
import site.gachijoopging.server.global.security.jwt.JwtVerifier;

@WebMvcTest(controllers = HealthController.class)
@Import({
  WebConfig.class,
  SecurityConfig.class,
  HealthController.class,
  RequestIdFilter.class,
  GlobalExceptionHandler.class
})
class HealthControllerTest {

  @Autowired private MockMvc mockMvc;

  @MockitoBean private JwtVerifier jwtVerifier;

  @MockitoBean private AccountAuthorityLoader accountAuthorityLoader;

  @Test
  void 헬스체크는_성공_봉투로_200_을_낸다() throws Exception {
    mockMvc
        .perform(get("/api/v1/health"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.status").value("UP"));
  }

  @Test
  void 접두사가_없는_경로로는_닿지_않는다() throws Exception {
    mockMvc.perform(get("/health")).andExpect(status().is4xxClientError());
  }
}
