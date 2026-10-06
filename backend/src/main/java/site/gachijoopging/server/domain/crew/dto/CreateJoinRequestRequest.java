package site.gachijoopging.server.domain.crew.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import site.gachijoopging.server.domain.crew.service.InviteCodes;

public record CreateJoinRequestRequest(
    @NotNull @Pattern(regexp = InviteCodes.PATTERN) String inviteCode) {}
