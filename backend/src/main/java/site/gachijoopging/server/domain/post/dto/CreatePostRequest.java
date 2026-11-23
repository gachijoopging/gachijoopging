package site.gachijoopging.server.domain.post.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import site.gachijoopging.server.domain.post.entity.PostVisibility;

// text 길이는 코드포인트로 세야 해 서비스에서 본다 — @Size 는 UTF-16 단위라 이모지를 두 글자로 센다
public record CreatePostRequest(
    @NotNull UUID id,
    @NotNull String text,
    @NotNull PostVisibility visibility,
    @NotNull @Size(max = 10) List<@NotNull UUID> mediaIds) {}
