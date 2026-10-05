package site.gachijoopging.server.domain.crew.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public record UserBriefResponse(
    String id, String nickname, @Schema(nullable = true) String photoUrl, boolean withdrawn) {}
