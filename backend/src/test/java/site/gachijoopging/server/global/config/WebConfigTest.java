package site.gachijoopging.server.global.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import site.gachijoopging.server.global.security.AccountAuthorityLoader;
import site.gachijoopging.server.global.security.jwt.JwtVerifier;
import site.gachijoopging.server.global.web.HealthController;
import site.gachijoopging.server.global.web.NoApiPrefix;

@WebMvcTest(
    controllers = {
      HealthController.class,
      WebConfigTest.접두사_없는_탐침_컨트롤러.class
    })
@Import({
  WebConfig.class,
  HealthController.class,
  WebConfigTest.접두사_없는_탐침_컨트롤러.class
})
class WebConfigTest {

  @Autowired private RequestMappingHandlerMapping handlerMapping;
  @Autowired private Environment environment;

  @MockitoBean private JwtVerifier jwtVerifier;

  @MockitoBean private AccountAuthorityLoader accountAuthorityLoader;

  @Test
  void 기존_도메인은_api_v1_접두사를_유지한다() {
    assertThat(등록된_경로()).contains("/api/v1/health");
  }

  @Test
  void NoApiPrefix_가_붙은_컨트롤러는_접두사를_받지_않는다() {
    assertThat(등록된_경로())
        .contains("/livekit/probe")
        .doesNotContain("/api/v1/livekit/probe", "/admin/livekit/probe");
  }

  @Test
  void admin_접두사가_api_v1_보다_먼저_등록된다() {
    List<String> 순서 = new ArrayList<>(handlerMapping.getPathPrefixes().keySet());

    assertThat(순서).containsExactly("/admin", WebConfig.API_BASE_PATH);
  }

  @Test
  void context_path_를_쓰지_않는다() {
    assertThat(environment.getProperty("server.servlet.context-path")).isNull();
  }

  @NoApiPrefix
  @RestController
  static class 접두사_없는_탐침_컨트롤러 {

    @PostMapping("/livekit/probe")
    String post() {
      return "ok";
    }
  }

  private List<String> 등록된_경로() {
    List<String> 경로 = new ArrayList<>();
    handlerMapping.getHandlerMethods().keySet().forEach(info -> 경로.addAll(info.getPatternValues()));
    return 경로;
  }
}
