package site.gachijoopging.server.domain.crew.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class InviteCodesTest {

  @Test
  void 발급한_코드는_XX_XXXX_형식이고_헷갈리는_글자가_없다() {
    IntStream.range(0, 1000)
        .mapToObj(i -> InviteCodes.issue())
        .forEach(
            code ->
                assertThat(code)
                    .matches("^[A-Z2-9]{2}-[A-Z2-9]{4}$")
                    .doesNotContain("0", "O", "1", "I"));
  }

  @Test
  void 대소문자와_하이픈을_가리지_않고_같은_형식으로_맞춘다() {
    assertThat(InviteCodes.canonical("hg7k2p")).isEqualTo("HG-7K2P");
    assertThat(InviteCodes.canonical("Hg-7k2P")).isEqualTo("HG-7K2P");
  }
}
