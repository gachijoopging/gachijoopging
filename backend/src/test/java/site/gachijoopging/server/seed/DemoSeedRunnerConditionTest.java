package site.gachijoopging.server.seed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.time.Clock;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

class DemoSeedRunnerConditionTest {

  private final ApplicationContextRunner contextRunner =
      new ApplicationContextRunner().withUserConfiguration(DemoSeedRunner.class);

  @Test
  void 플래그가_없으면_러너_빈이_뜨지_않는다() {
    contextRunner.run(context -> assertThat(context).doesNotHaveBean(DemoSeedRunner.class));
  }

  @Test
  void 플래그가_false_면_러너_빈이_뜨지_않는다() {
    contextRunner
        .withPropertyValues("app.seed.demo.enabled=false")
        .run(context -> assertThat(context).doesNotHaveBean(DemoSeedRunner.class));
  }

  @Test
  void 플래그를_켜고_자격_값이_없으면_기동이_실패한다() {
    contextRunner
        .withBean(JdbcClient.class, () -> mock(JdbcClient.class))
        .withBean(PasswordEncoder.class, BCryptPasswordEncoder::new)
        .withBean(Clock.class, Clock::systemUTC)
        .withPropertyValues("app.seed.demo.enabled=true")
        .run(context -> assertThat(context).hasFailed());
  }
}
