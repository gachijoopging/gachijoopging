package site.gachijoopging.server.domain.crew.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.Optional;
import java.util.UUID;
import site.gachijoopging.server.domain.crew.entity.JoinPolicy;
import site.gachijoopging.server.domain.crew.entity.Region;

// photoMediaId: 키가 없으면 그대로, null 이면 사진을 지운다 — 둘을 가르려고 Optional 이다
public record UpdateCrewRequest(
    @Size(min = 2, max = 20) String name,
    @Size(max = 200) String intro,
    Optional<UUID> photoMediaId,
    Region region,
    JoinPolicy joinPolicy,
    @Min(1) Integer goalCount) {}
