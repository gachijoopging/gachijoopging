package site.gachijoopging.server.domain.stats.dto;

import java.util.List;
import java.util.Map;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;

public record HomeResponse(
    HomeCrew crew,
    Last7d last7d,
    CrewCharacter character,
    LiveSummary live,
    long unreadNotifications) {

  public record HomeCrew(String id, String name) {}

  public record Last7d(
      long crewItems, long myItems, Map<String, Integer> myByCategory, List<Long> daily) {}

  public record CrewCharacter(int windowDays, long items, int goalCount, int stage) {}

  public record LiveSummary(int count, List<UserBriefResponse> users) {}
}
