package site.gachijoopging.server.domain.crew.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import site.gachijoopging.server.domain.crew.entity.JoinPolicy;
import site.gachijoopging.server.domain.crew.entity.Region;

public record CreateCrewRequest(
    @NotNull @Size(min = 2, max = 20) String name,
    @Size(max = 200) String intro,
    @NotNull Region region,
    @NotNull JoinPolicy joinPolicy) {}
