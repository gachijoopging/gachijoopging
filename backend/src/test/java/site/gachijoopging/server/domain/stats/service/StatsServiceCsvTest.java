package site.gachijoopging.server.domain.stats.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class StatsServiceCsvTest {

  @ParameterizedTest(name = "[{0}] 는 [{1}]")
  @CsvSource(
      delimiter = '|',
      quoteCharacter = '`',
      value = {
        "민지|민지",
        "=1+1|'=1+1",
        "+82|'+82",
        "-x|'-x",
        "@SUM(A1)|'@SUM(A1)",
        "a,b|`\"a,b\"`",
        "say \"hi\"|`\"say \"\"hi\"\"\"`",
        "=a,b|`\"'=a,b\"`"
      })
  void 엑셀이_수식으로_읽지_않게_하고_RFC_4180_으로_감싼다(String 값, String 칸) {
    assertThat(StatsService.csvText(값)).isEqualTo(칸);
  }
}
