package site.gachijoopging.server.domain.chat.dto;

import java.time.Instant;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;

public record ChatMessageResponse(
    long seq, String id, UserBriefResponse author, String text, Instant createdAt) {}
