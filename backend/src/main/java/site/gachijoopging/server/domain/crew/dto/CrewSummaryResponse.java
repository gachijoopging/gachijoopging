package site.gachijoopging.server.domain.crew.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import site.gachijoopging.server.domain.crew.entity.JoinPolicy;
import site.gachijoopging.server.domain.crew.entity.Region;

public record CrewSummaryResponse(
    String id,
    String name,
    String intro,
    @Schema(nullable = true) String photoUrl,
    Region region,
    JoinPolicy joinPolicy,
    int memberCount,
    UserBriefResponse leader) {}
