package site.gachijoopging.server.global.websocket;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;

@Slf4j
@Component
public class CrewSessions {

  static final CloseStatus NO_CREW = new CloseStatus(4403, "소속 크루가 없다");

  private final Map<UUID, Set<WebSocketSession>> sessions = new ConcurrentHashMap<>();

  void register(UUID userId, WebSocketSession session) {
    sessions.computeIfAbsent(userId, id -> ConcurrentHashMap.newKeySet()).add(session);
  }

  void unregister(UUID userId, WebSocketSession session) {
    sessions.computeIfPresent(
        userId,
        (id, set) -> {
          set.remove(session);
          return set.isEmpty() ? null : set;
        });
  }

  public void close(UUID userId) {
    for (WebSocketSession session : sessions.getOrDefault(userId, Set.of())) {
      try {
        session.close(NO_CREW);
      } catch (IOException | RuntimeException e) {
        // 한 세션이 실패해도 같은 사람의 나머지 세션은 닫는다. 세션을 문자열로 찍으면 ?token= 이 든 URI 가 남는다
        log.warn("소켓 닫기 실패 — session {}", session.getId(), e);
      }
    }
  }
}
