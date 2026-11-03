package site.gachijoopging.server.domain.user;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import site.gachijoopging.server.domain.user.controller.AgreementController;
import site.gachijoopging.server.domain.user.repository.UserAgreementRepository;
import site.gachijoopging.server.domain.user.service.AgreementProperties;
import site.gachijoopging.server.domain.user.service.AgreementService;
import site.gachijoopging.server.global.config.ClockConfig;
import site.gachijoopging.server.global.config.WebConfig;
import site.gachijoopging.server.global.security.AccountAuthorityLoader;
import site.gachijoopging.server.global.security.JwtAuthenticationFilter;
import site.gachijoopging.server.global.security.SecurityConfig;
import site.gachijoopging.server.global.security.jwt.JwtVerifier;

// DB 없는 슬라이스로 본다 — 설정을 비운 통합 컨텍스트를 하나 더 띄우면 테스트 Postgres 의
// max_connections 를 넘는다. 설정이 있는 경우는 AgreementApiTest
@WebMvcTest(controllers = AgreementController.class)
@Import({
  WebConfig.class,
  SecurityConfig.class,
  JwtAuthenticationFilter.class,
  ClockConfig.class,
  AgreementService.class
})
@EnableConfigurationProperties(AgreementProperties.class)
@TestPropertySource(
    properties = {
      "app.agreements.version=2026-10",
      "app.agreements.terms-url=https://legal.test/terms",
      "app.agreements.privacy-url=https://legal.test/privacy",
      "app.agreements.marketing-url="
    })
class AgreementUnconfiguredTest {

  @MockitoBean private JwtVerifier jwtVerifier;
  @MockitoBean private AccountAuthorityLoader accountAuthorityLoader;
  @MockitoBean private UserAgreementRepository userAgreementRepository;

  @Autowired private MockMvc mockMvc;

  @Test
  void URL_하나라도_없으면_가입_전_동의_목록은_503_UNAVAILABLE_이다() throws Exception {
    mockMvc
        .perform(get("/api/v1/agreements"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.code").value("UNAVAILABLE"));
  }
}
