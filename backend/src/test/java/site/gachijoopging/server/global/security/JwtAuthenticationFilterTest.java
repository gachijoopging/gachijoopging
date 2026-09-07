package site.gachijoopging.server.global.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.global.config.WebConfig;
import site.gachijoopging.server.global.error.GlobalExceptionHandler;
import site.gachijoopging.server.global.security.jwt.JwtIssuer;
import site.gachijoopging.server.global.security.jwt.JwtProperties;
import site.gachijoopging.server.global.security.jwt.JwtVerifier;

@WebMvcTest(controllers = JwtAuthenticationFilterTest.탐침_컨트롤러.class)
@Import({
  WebConfig.class,
  SecurityConfig.class,
  JwtAuthenticationFilter.class,
  GlobalExceptionHandler.class,
  JwtAuthenticationFilterTest.키_설정.class,
  JwtAuthenticationFilterTest.탐침_컨트롤러.class
})
class JwtAuthenticationFilterTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JwtIssuer issuer;

  @Test
  void 유효한_토큰이면_CurrentUser_로_사용자_id_가_들어온다() throws Exception {
    UUID 사용자 = UUID.randomUUID();

    mockMvc
        .perform(get("/api/v1/probe/me").header("Authorization", "Bearer " + issuer.issue(사용자)))
        .andExpect(status().isOk())
        .andExpect(content().string(사용자.toString()));
  }

  @Test
  void 토큰이_없으면_401_에러봉투다() throws Exception {
    mockMvc
        .perform(get("/api/v1/probe/me"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("TOKEN_EXPIRED"));
  }

  @Test
  void 망가진_토큰이면_401_에러봉투다() throws Exception {
    mockMvc
        .perform(get("/api/v1/probe/me").header("Authorization", "Bearer not-a-jwt"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("TOKEN_EXPIRED"));
  }

  @Test
  void Bearer_가_아니면_401_이다() throws Exception {
    mockMvc
        .perform(get("/api/v1/probe/me").header("Authorization", "Basic abcdef"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void 개방_경로는_토큰_없이도_통과한다() throws Exception {
    mockMvc.perform(get("/api/v1/auth/probe")).andExpect(status().isOk());
  }

  @Test
  void 만료된_토큰이면_401_이다() throws Exception {
    String 토큰 = new JwtIssuer(키_설정.짧은_수명(), Clock.systemUTC()).issue(UUID.randomUUID());
    Thread.sleep(1100);

    mockMvc
        .perform(get("/api/v1/probe/me").header("Authorization", "Bearer " + 토큰))
        .andExpect(status().isUnauthorized());
  }

  @TestConfiguration
  static class 키_설정 {

    private static final JwtProperties PROPERTIES = 새_설정();

    static JwtProperties 짧은_수명() {
      return new JwtProperties(
          PROPERTIES.activeKid(),
          PROPERTIES.privateKeyPem(),
          PROPERTIES.publicKeyPem(),
          PROPERTIES.previousKid(),
          PROPERTIES.previousPublicKeyPem(),
          Duration.ofSeconds(1));
    }

    @Bean
    AccountAuthorityLoader accountAuthorityLoader() {
      return userId -> List.of();
    }

    @Bean
    JwtIssuer jwtIssuer() {
      return new JwtIssuer(PROPERTIES, Clock.systemUTC());
    }

    @Bean
    JwtVerifier jwtVerifier() {
      return new JwtVerifier(PROPERTIES, Clock.systemUTC());
    }

    private static JwtProperties 새_설정() {
      try {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        KeyPair pair = generator.generateKeyPair();
        return new JwtProperties(
            "test-kid",
            pem("PRIVATE KEY", pair.getPrivate().getEncoded()),
            pem("PUBLIC KEY", pair.getPublic().getEncoded()),
            null,
            null,
            Duration.ofSeconds(60));
      } catch (Exception e) {
        throw new IllegalStateException(e);
      }
    }

    private static String pem(String label, byte[] der) {
      return "-----BEGIN "
          + label
          + "-----\n"
          + Base64.getMimeEncoder(64, new byte[] {'\n'}).encodeToString(der)
          + "\n-----END "
          + label
          + "-----";
    }
  }

  @RestController
  static class 탐침_컨트롤러 {

    @GetMapping("/probe/me")
    String me(@CurrentUser UUID userId) {
      return userId.toString();
    }

    @GetMapping("/auth/probe")
    String open() {
      return "ok";
    }
  }
}
