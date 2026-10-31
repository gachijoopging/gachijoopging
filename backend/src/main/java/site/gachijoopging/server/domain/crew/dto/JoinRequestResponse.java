package site.gachijoopging.server.domain.crew.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;

public record JoinRequestResponse(
    String id,
    CrewRef crew,
    UserBriefResponse user,
    @Schema(allowableValues = {"PENDING", "APPROVED", "REJECTED", "CANCELED"}) String status,
    Instant createdAt) {

  public record CrewRef(String id, String name) {}
}
