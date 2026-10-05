package site.gachijoopging.server.domain.crew.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateCrewRequest(@NotNull @Size(min = 2, max = 20) String name) {}
