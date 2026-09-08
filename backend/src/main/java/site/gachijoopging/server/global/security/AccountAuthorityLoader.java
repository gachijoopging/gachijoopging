package site.gachijoopging.server.global.security;

import java.util.Collection;
import java.util.UUID;
import org.springframework.security.core.GrantedAuthority;

public interface AccountAuthorityLoader {

  Collection<? extends GrantedAuthority> authoritiesOf(UUID userId);
}
