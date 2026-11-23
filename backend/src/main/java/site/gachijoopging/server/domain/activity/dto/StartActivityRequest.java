package site.gachijoopging.server.domain.activity.dto;

import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.UUID;

public record StartActivityRequest(
    @NotNull UUID id, @NotNull Instant startedAt, @NotNull Boolean locationShared) {}
