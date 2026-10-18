package site.gachijoopging.server.domain.crew.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record ChangeLeaderRequest(@NotNull UUID userId) {}
