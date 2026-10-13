package site.gachijoopging.server.domain.crew.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;

public record MemberResponse(
    String id,
    String nickname,
    @Schema(nullable = true) String photoUrl,
    boolean withdrawn,
    boolean isLeader,
    long totalItems,
    Instant joinedAt,
    boolean following) {}
