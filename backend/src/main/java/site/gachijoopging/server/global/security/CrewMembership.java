package site.gachijoopging.server.global.security;

import java.util.UUID;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

public record CrewMembership(UUID crewId, boolean leader) {

  public void requireLeader() {
    if (!leader) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "크루장만 할 수 있다");
    }
  }
}
