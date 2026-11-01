package site.gachijoopging.server.domain.chat.dto;

import java.util.List;

/** hasMore — beforeSeq·첫 장이면 더 오래된 메시지가, afterSeq 면 더 새로운 메시지가 남았는가. */
public record ChatMessagesResponse(List<ChatMessageResponse> items, boolean hasMore) {}
