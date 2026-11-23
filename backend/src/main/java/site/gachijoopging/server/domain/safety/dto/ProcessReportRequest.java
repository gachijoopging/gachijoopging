package site.gachijoopging.server.domain.safety.dto;

import jakarta.validation.constraints.NotNull;
import site.gachijoopging.server.domain.safety.entity.ReportResult;

public record ProcessReportRequest(@NotNull ReportResult result) {}
