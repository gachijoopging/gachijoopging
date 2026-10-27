package site.gachijoopging.server.global.security;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface SessionCutoffLoader {

  Optional<Instant> sessionCutoffOf(UUID userId);
}
