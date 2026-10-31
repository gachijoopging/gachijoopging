package site.gachijoopging.server.domain.stats.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class StatsServiceStageTest {

  @ParameterizedTest(name = "목표 100 에 {0}개면 {1}단계")
  @CsvSource({"0,1", "19,1", "20,2", "49,2", "50,3", "79,3", "80,4", "99,4", "100,5", "250,5"})
  void 목표_대비_비율로_캐릭터_단계를_정한다(long 수량, int 단계) {
    assertThat(StatsService.stage(수량, 100)).isEqualTo(단계);
  }

  @ParameterizedTest(name = "목표 300 에 {0}개면 {1}단계")
  @CsvSource({"59,1", "60,2", "299,4", "300,5"})
  void 나누어떨어지지_않는_목표도_내림한_비율로_본다(long 수량, int 단계) {
    assertThat(StatsService.stage(수량, 300)).isEqualTo(단계);
  }
}
