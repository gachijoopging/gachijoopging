package site.gachijoopging.server.domain.crew.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record CreateJoinRequestRequest(@NotNull UUID crewId) {}
