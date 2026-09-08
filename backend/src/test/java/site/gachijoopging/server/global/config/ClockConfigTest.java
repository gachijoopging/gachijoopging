package site.gachijoopging.server.global.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

@SpringJUnitConfig(ClockConfig.class)
class ClockConfigTest {

  @Autowired private Clock clock;

  @Test
  void Clock_빈은_UTC_다() {
    assertThat(clock.getZone()).isEqualTo(ZoneOffset.UTC);
  }
}
