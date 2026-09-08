package site.gachijoopging.server.contract;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;
import site.gachijoopging.server.global.metrics.GachijoopgingMetrics;

class MetricNameContractTest {

  private static final Path 알람_규칙 = Path.of("..", "infra", "prometheus", "rules", "alerts.yml");

  private static final Pattern 우리_지표 = Pattern.compile("gachijoopging_[a-z0-9_]+");

  @Test
  void 알람이_참조하는_지표를_코드가_전부_노출한다() throws IOException {
    Set<String> 알람이_요구하는_이름 = 알람_규칙이_참조하는_지표();
    Set<String> 코드가_노출하는_이름 = GachijoopgingMetrics.prometheusNames();

    assertThat(알람이_요구하는_이름).isNotEmpty();
    assertThat(알람이_요구하는_이름)
        .as("alerts.yml 이 참조하는데 코드가 내보내지 않는 지표 — 그 알람은 조용히 발동하지 않는다")
        .isSubsetOf(코드가_노출하는_이름);
  }

  @Test
  void 코드가_노출하는_지표를_알람이_전부_참조한다() throws IOException {
    Set<String> 알람이_요구하는_이름 = 알람_규칙이_참조하는_지표();

    assertThat(GachijoopgingMetrics.prometheusNames())
        .as("코드가 내보내는데 alerts.yml 이 보지 않는 지표 — 아무도 감시하지 않는다")
        .isSubsetOf(알람이_요구하는_이름);
  }

  private static Set<String> 알람_규칙이_참조하는_지표() throws IOException {
    Set<String> 이름 = new TreeSet<>();
    for (String 식 : 규칙의_식()) {
      Matcher matcher = 우리_지표.matcher(식);
      while (matcher.find()) {
        이름.add(matcher.group());
      }
    }
    return 이름;
  }

  @SuppressWarnings("unchecked")
  private static List<String> 규칙의_식() throws IOException {
    Map<String, Object> 문서 = new Yaml().load(Files.readString(알람_규칙));
    List<String> 식 = new ArrayList<>();
    for (Map<String, Object> 그룹 : (List<Map<String, Object>>) 문서.get("groups")) {
      for (Map<String, Object> 규칙 : (List<Map<String, Object>>) 그룹.get("rules")) {
        식.add(String.valueOf(규칙.get("expr")));
      }
    }
    return 식;
  }
}
