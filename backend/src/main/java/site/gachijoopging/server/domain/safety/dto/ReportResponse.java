package site.gachijoopging.server.domain.safety.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;

// targetType·reason 은 계약의 Report 에서 enum 이 아닌 string 이다
public record ReportResponse(
    String id,
    UserBriefResponse reporter,
    String targetType,
    String targetId,
    String targetPreview,
    String reason,
    @Schema(nullable = true) String memo,
    Instant createdAt) {}
