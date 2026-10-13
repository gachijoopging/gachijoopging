package site.gachijoopging.server.domain.crew.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record MemberProfileResponse(
    String id,
    String nickname,
    @Schema(nullable = true) String photoUrl,
    boolean withdrawn,
    boolean isLeader,
    Instant joinedAt,
    boolean following,
    String intro,
    boolean blocked,
    long totalItems,
    long totalDistanceM,
    long totalActivities,
    List<LocalDate> activeDays) {}
