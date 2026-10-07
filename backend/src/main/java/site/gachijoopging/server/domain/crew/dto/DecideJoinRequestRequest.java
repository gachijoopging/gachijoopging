package site.gachijoopging.server.domain.crew.dto;

import jakarta.validation.constraints.NotNull;

public record DecideJoinRequestRequest(@NotNull Decision decision) {

  public enum Decision {
    APPROVE,
    REJECT
  }
}
