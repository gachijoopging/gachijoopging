package site.gachijoopging.server.domain.stats.controller;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.domain.activity.dto.ActivityCardResponse;
import site.gachijoopging.server.domain.stats.dto.CalendarResponse;
import site.gachijoopging.server.domain.stats.dto.CrewStatsResponse;
import site.gachijoopging.server.domain.stats.dto.HomeResponse;
import site.gachijoopging.server.domain.stats.dto.MemberStatsResponse;
import site.gachijoopging.server.domain.stats.dto.StatsRange;
import site.gachijoopging.server.domain.stats.service.StatsService;
import site.gachijoopging.server.global.response.ApiResponse;
import site.gachijoopging.server.global.response.CursorPage;
import site.gachijoopging.server.global.security.CrewMembership;
import site.gachijoopging.server.global.security.CurrentCrew;
import site.gachijoopging.server.global.security.CurrentUser;

@RestController
@RequiredArgsConstructor
public class StatsController {

  private final StatsService statsService;

  @GetMapping("/crew/home")
  public ApiResponse<HomeResponse> home(@CurrentUser UUID me, @CurrentCrew CrewMembership crew) {
    return ApiResponse.of(statsService.home(me, crew.crewId()));
  }

  @GetMapping("/crew/stats")
  public ApiResponse<CrewStatsResponse> crewStats(
      @CurrentCrew CrewMembership crew, @RequestParam(defaultValue = "MONTH") StatsRange range) {
    return ApiResponse.of(statsService.crewStats(crew.crewId(), range));
  }

  @GetMapping("/crew/calendar")
  public ApiResponse<CalendarResponse> calendar(
      @CurrentCrew CrewMembership crew,
      @RequestParam @Pattern(regexp = "^\\d{4}-\\d{2}$") String month) {
    return ApiResponse.of(statsService.calendar(crew.crewId(), month));
  }

  @GetMapping("/users/me/stats")
  public ApiResponse<MemberStatsResponse> myStats(@CurrentUser UUID me) {
    return ApiResponse.of(statsService.myStats(me));
  }

  @GetMapping("/crew/members/{userId}/activities")
  public ApiResponse<CursorPage<ActivityCardResponse>> memberActivities(
      @CurrentCrew CrewMembership crew,
      @PathVariable UUID userId,
      @RequestParam(required = false) String cursor,
      @RequestParam(defaultValue = "20") @Min(1) @Max(50) int limit) {
    return ApiResponse.of(statsService.memberActivities(crew.crewId(), userId, cursor, limit));
  }
}
