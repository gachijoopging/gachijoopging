package site.gachijoopging.server.domain.stats.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;

public record CrewStatsResponse(
    String range,
    StatsTotals totals,
    Map<String, Integer> byCategory,
    List<SeriesPoint> series,
    List<RankEntry> ranking) {

  public record StatsTotals(long items, long distanceM, long durationSec, long activities) {}

  public record SeriesPoint(LocalDate date, long items) {}

  public record RankEntry(int rank, UserBriefResponse user, long items, long distanceM) {}
}
