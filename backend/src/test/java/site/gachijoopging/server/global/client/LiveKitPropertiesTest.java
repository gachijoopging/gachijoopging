package site.gachijoopging.server.global.client;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class LiveKitPropertiesTest {

  private final ApplicationContextRunner runner =
      new ApplicationContextRunner()
          .withInitializer(new ConfigDataApplicationContextInitializer())
          .withUserConfiguration(TestConfig.class);

  @Test
  void 값이_없으면_url_과_시크릿이_빈_문자열이다() {
    runner.run(
        context -> {
          LiveKitProperties properties = context.getBean(LiveKitProperties.class);

          assertThat(properties.url()).isEmpty();
          assertThat(properties.apiSecret()).isEmpty();
        });
  }

  @Test
  void 키_이름의_기본값이_livekit_yaml_과_같다() {
    runner.run(
        context ->
            assertThat(context.getBean(LiveKitProperties.class).apiKey()).isEqualTo("gachikey"));
  }

  @Test
  void 토큰_수명이_yml_에서_바인딩된다() {
    runner.run(
        context ->
            assertThat(context.getBean(LiveKitProperties.class).tokenTtl())
                .isEqualTo(Duration.ofHours(6)));
  }

  @Test
  void 서버용_API_주소와_타임아웃이_yml_에서_바인딩된다() {
    runner.run(
        context -> {
          LiveKitProperties properties = context.getBean(LiveKitProperties.class);

          assertThat(properties.apiUrl()).isEmpty();
          assertThat(properties.apiTimeout()).isEqualTo(Duration.ofSeconds(3));
        });
  }

  @Test
  void 환경변수가_yml_기본값을_덮는다() {
    runner
        .withPropertyValues(
            "app.livekit.url=wss://example.test/livekit",
            "app.livekit.api-key=other",
            "app.livekit.api-secret=s3cret")
        .run(
            context -> {
              LiveKitProperties properties = context.getBean(LiveKitProperties.class);

              assertThat(properties.url()).isEqualTo("wss://example.test/livekit");
              assertThat(properties.apiKey()).isEqualTo("other");
              assertThat(properties.apiSecret()).isEqualTo("s3cret");
            });
  }

  @EnableConfigurationProperties(LiveKitProperties.class)
  static class TestConfig {}
}
