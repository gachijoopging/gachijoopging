package site.gachijoopging.server.domain.crew.dto;

import java.time.Instant;

public record JoinRequestResponse(
    String id, CrewRef crew, UserBriefResponse user, String status, Instant createdAt) {

  public record CrewRef(String id, String name) {}
}
