package site.gachijoopging.server.domain.chat.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record SendChatRequest(@NotNull UUID id, @NotNull String text) {}
