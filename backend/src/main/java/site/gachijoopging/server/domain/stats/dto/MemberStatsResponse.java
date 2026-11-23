package site.gachijoopging.server.domain.stats.dto;

import java.time.LocalDate;
import java.util.List;

public record MemberStatsResponse(
    long totalItems, long totalDistanceM, long totalActivities, List<LocalDate> activeDays) {}
