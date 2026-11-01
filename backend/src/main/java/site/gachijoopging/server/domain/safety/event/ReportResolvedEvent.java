package site.gachijoopging.server.domain.safety.event;

import java.util.UUID;
import site.gachijoopging.server.domain.safety.entity.ReportResult;

/** result 가 null 이면 대상 추방으로 닫힌 것이다. */
public record ReportResolvedEvent(UUID reportId, UUID reporterId, ReportResult result) {}
