package site.gachijoopging.server.domain.user.dto;

import jakarta.validation.constraints.Size;
import java.util.Optional;
import java.util.UUID;

// photoMediaId: 키가 없으면 그대로, null 이면 사진을 지운다 — 둘을 가르려고 Optional 이다
public record MeUpdateRequest(
    @Size(min = 2, max = 12) String nickname,
    @Size(max = 200) String intro,
    Optional<UUID> photoMediaId,
    Boolean shareLocationDefault,
    Boolean notifyActivityStart) {}
