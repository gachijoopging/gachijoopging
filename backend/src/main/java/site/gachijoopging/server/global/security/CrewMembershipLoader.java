package site.gachijoopging.server.global.security;

import java.util.Optional;
import java.util.UUID;

public interface CrewMembershipLoader {

  Optional<CrewMembership> membershipOf(UUID userId);
}
