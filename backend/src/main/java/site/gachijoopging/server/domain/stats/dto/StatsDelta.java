package site.gachijoopging.server.domain.stats.dto;

import java.util.Map;
import java.util.TreeMap;

/** 크루 하루 합산에 더할 값. 빼려면 음수로 싣는다. */
public record StatsDelta(
    int activityCount, int durationSec, int distanceM, Map<String, Integer> byCategory) {

  public int itemCount() {
    return byCategory.values().stream().mapToInt(Integer::intValue).sum();
  }

  public StatsDelta negate() {
    Map<String, Integer> negated = new TreeMap<>();
    byCategory.forEach((category, quantity) -> negated.put(category, -quantity));
    return new StatsDelta(-activityCount, -durationSec, -distanceM, negated);
  }
}
