package site.gachijoopging.server.domain.notice.dto;

import io.swagger.v3.oas.annotations.media.Schema;

// 보낸 필드만 바꾼다. 길이는 CreateNoticeRequest 와 같이 서비스에서 본다
public record UpdateNoticeRequest(
    @Schema(nullable = true) String title, @Schema(nullable = true) String body) {}
