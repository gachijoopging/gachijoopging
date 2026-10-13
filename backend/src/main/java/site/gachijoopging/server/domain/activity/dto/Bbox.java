package site.gachijoopging.server.domain.activity.dto;

import jakarta.validation.constraints.NotNull;

public record Bbox(@NotNull Float x, @NotNull Float y, @NotNull Float w, @NotNull Float h) {}
