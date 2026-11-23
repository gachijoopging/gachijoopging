package site.gachijoopging.server.global.security;

import java.util.Collection;
import org.springframework.security.core.GrantedAuthority;
import site.gachijoopging.server.global.security.jwt.JwtVerifier;

public interface AccountAuthorityLoader {

  // 세션 대조와 계정 확인이 같은 사용자 행을 본다 — 요청마다 한 번만 읽으려고 둘을 여기서 함께 한다.
  // 끊긴 세션의 토큰이거나 쓸 수 없는 계정이면 BusinessException 을 던진다
  Collection<? extends GrantedAuthority> authoritiesOf(JwtVerifier.Token token);
}
