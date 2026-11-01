package site.gachijoopging.server.domain.safety.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;
import site.gachijoopging.server.domain.safety.entity.ReportReason;
import site.gachijoopging.server.domain.safety.entity.ReportTargetType;

// memo 길이는 코드포인트로 세야 해 서비스에서 본다 — @Size 는 UTF-16 단위라 이모지를 두 글자로 센다
public record CreateReportRequest(
    @NotNull UUID id,
    @NotNull ReportTargetType targetType,
    @NotNull String targetId,
    @NotNull ReportReason reason,
    String memo) {}
