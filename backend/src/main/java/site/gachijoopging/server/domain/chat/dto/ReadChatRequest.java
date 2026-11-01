package site.gachijoopging.server.domain.chat.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record ReadChatRequest(@NotNull @PositiveOrZero Long lastSeq) {}
