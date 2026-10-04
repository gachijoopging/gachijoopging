package site.gachijoopging.server.domain.crew.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public record CrewPreviewResponse(
    String id,
    String name,
    int memberCount,
    @Schema(nullable = true) String photoUrl,
    String intro,
    UserBriefResponse leader) {}
