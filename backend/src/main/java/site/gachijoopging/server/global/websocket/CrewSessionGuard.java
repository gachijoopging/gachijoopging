package site.gachijoopging.server.global.websocket;

import java.security.Principal;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;
import org.springframework.web.socket.handler.WebSocketSessionDecorator;
import site.gachijoopging.server.global.security.CrewMembershipLoader;

// 닫힘 코드는 docs/realtime.md §연결 — 4401 이면 앱이 refresh 뒤 재연결, 4403 이면 GET /users/me
@Slf4j
class CrewSessionGuard extends WebSocketHandlerDecorator {

  static final CloseStatus TOKEN_REJECTED = new CloseStatus(4401, "accessToken 거부");

  private final ObjectProvider<CrewMembershipLoader> crewMembershipLoader;
  private final CrewSessions crewSessions;

  CrewSessionGuard(
      WebSocketHandler delegate,
      ObjectProvider<CrewMembershipLoader> crewMembershipLoader,
      CrewSessions crewSessions) {
    super(delegate);
    this.crewMembershipLoader = crewMembershipLoader;
    this.crewSessions = crewSessions;
  }

  @Override
  public void afterConnectionEstablished(WebSocketSession session) throws Exception {
    try {
      Principal user = session.getPrincipal();
      if (user == null) {
        session.close(TOKEN_REJECTED);
        return;
      }
      UUID userId = UUID.fromString(user.getName());
      // 소속 검사와 추방 커밋이 엇갈려도 추방 쪽이 이 세션을 찾아 닫을 수 있게 검사 전에 올린다
      crewSessions.register(userId, session);
      if (crewMembershipLoader.getObject().membershipOf(userId).isEmpty()) {
        session.close(CrewSessions.NO_CREW);
        return;
      }
      super.afterConnectionEstablished(new TokenHidden(session));
    } catch (Exception e) {
      // 예외가 밖으로 나가면 Spring 이 세션을 문자열로 찍는데, 그 안에 ?token= 이 든 URI 가 있다
      log.error("소켓 연결 처리 실패 — session {}", session.getId(), e);
      session.close(CloseStatus.SERVER_ERROR);
    }
  }

  @Override
  public void afterConnectionClosed(WebSocketSession session, CloseStatus closeStatus)
      throws Exception {
    Principal user = session.getPrincipal();
    if (user != null) {
      crewSessions.unregister(UUID.fromString(user.getName()), session);
    }
    super.afterConnectionClosed(session, closeStatus);
  }

  // STOMP 처리기는 받은 세션을 보관하고 끊김·한도 초과 때 문자열로 로그에 남긴다. 그 문자열에서 토큰을 뺀다
  private static final class TokenHidden extends WebSocketSessionDecorator {

    TokenHidden(WebSocketSession session) {
      super(session);
    }

    @Override
    public String toString() {
      return "WebSocketSession[id=" + getId() + "]";
    }
  }
}
