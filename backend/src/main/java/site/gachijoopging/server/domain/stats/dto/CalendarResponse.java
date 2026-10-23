package site.gachijoopging.server.domain.stats.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;

public record CalendarResponse(List<CalendarDay> days) {

  public record CalendarDay(
      LocalDate date, long items, int activityCount, List<CalendarActivity> activities) {}

  public record CalendarActivity(
      String activityId, Instant startedAt, UserBriefResponse user, int items, int distanceM) {}
}
