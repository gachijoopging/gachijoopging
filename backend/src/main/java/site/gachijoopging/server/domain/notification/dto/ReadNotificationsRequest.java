package site.gachijoopging.server.domain.notification.dto;

import jakarta.validation.constraints.NotNull;
import java.util.List;

/** ids 가 없으면 전부 읽음으로 바꾼다. */
public record ReadNotificationsRequest(List<@NotNull Long> ids) {}
