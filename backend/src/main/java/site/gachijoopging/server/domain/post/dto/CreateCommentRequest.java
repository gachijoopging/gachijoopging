package site.gachijoopging.server.domain.post.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

// text 길이는 코드포인트로 세야 해 서비스에서 본다 — @Size 는 UTF-16 단위라 이모지를 두 글자로 센다
public record CreateCommentRequest(@NotNull UUID id, @NotNull String text) {}
