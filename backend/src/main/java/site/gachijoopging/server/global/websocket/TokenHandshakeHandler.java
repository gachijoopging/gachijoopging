package site.gachijoopging.server.global.websocket;

import java.security.Principal;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.support.DefaultHandshakeHandler;
import org.springframework.web.util.UriComponentsBuilder;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.security.jwt.JwtVerifier;

// 핸드셰이크를 HTTP 로 거절하면 앱은 닫힘 코드를 못 받는다. 그래서 여기서는 사용자만 정하고,
// 거절은 연결이 열린 뒤 CrewSessionGuard 가 4401·4403 으로 닫는다
class TokenHandshakeHandler extends DefaultHandshakeHandler {

  private final JwtVerifier jwtVerifier;

  TokenHandshakeHandler(JwtVerifier jwtVerifier) {
    this.jwtVerifier = jwtVerifier;
  }

  @Override
  protected Principal determineUser(
      ServerHttpRequest request, WebSocketHandler wsHandler, Map<String, Object> attributes) {
    String token =
        UriComponentsBuilder.fromUri(request.getURI()).build().getQueryParams().getFirst("token");
    if (token == null || token.isBlank()) {
      return null;
    }
    try {
      UUID userId = jwtVerifier.verify(token);
      return userId::toString;
    } catch (BusinessException e) {
      return null;
    }
  }
}
