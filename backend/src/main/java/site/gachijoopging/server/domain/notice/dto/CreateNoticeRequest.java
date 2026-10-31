package site.gachijoopging.server.domain.notice.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

// 길이는 앞뒤 공백을 뺀 코드포인트로 세야 해 서비스에서 본다 — @Size 는 UTF-16 단위다
public record CreateNoticeRequest(@NotNull UUID id, @NotNull String title, @NotNull String body) {}
