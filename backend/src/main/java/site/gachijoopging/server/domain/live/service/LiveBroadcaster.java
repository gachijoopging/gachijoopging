package site.gachijoopging.server.domain.live.service;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import site.gachijoopging.server.domain.live.dto.LiveEndedResponse;
import site.gachijoopging.server.domain.live.dto.LiveMemberResponse;
import site.gachijoopging.server.domain.live.dto.LiveUpdateResponse;
import site.gachijoopging.server.domain.live.repository.LiveLocationRepository;
import site.gachijoopging.server.global.websocket.SocketMessage;
import site.gachijoopging.server.global.websocket.WebSocketConfig;

// 앱이 더 자주 올려도 크루원 화면이 5초보다 자주 바뀔 필요가 없다 (docs/realtime.md §서버 → 앱).
// 서버가 한 대(ADR-0005)라 묶음은 메모리에 둔다. 인스턴스를 늘리면 Redis 로 옮긴다
@Service
@RequiredArgsConstructor
public class LiveBroadcaster {

  private record Pending(UUID crewId, UUID activityId, LiveUpdateResponse update) {}

  private final LiveLocationRepository repository;
  private final SimpMessagingTemplate messaging;
  private final Map<UUID, Pending> pending = new ConcurrentHashMap<>();

  public void update(UUID crewId, UUID userId, UUID activityId, LiveUpdateResponse update) {
    pending.put(userId, new Pending(crewId, activityId, update));
  }

  public void started(UUID crewId, UUID userId, LiveMemberResponse member) {
    send(crewId, userId, "LIVE_STARTED", member);
  }

  // 끝난 뒤 묶여 있던 갱신이 나가면 앱 목록에 그 사람이 다시 생긴다
  public synchronized void ended(UUID crewId, UUID userId, UUID activityId) {
    pending.remove(userId);
    send(
        crewId,
        userId,
        "LIVE_ENDED",
        new LiveEndedResponse(userId.toString(), activityId.toString()));
  }

  @Scheduled(
      fixedRateString = "${live.broadcast-interval}",
      initialDelayString = "${live.broadcast-interval}")
  public synchronized void flush() {
    for (UUID userId : pending.keySet()) {
      Pending next = pending.remove(userId);
      // 종료가 커밋된 뒤 남은 갱신이 나가면 앱 목록에 끝난 사람이 다시 생긴다.
      // 곧바로 다음 활동을 시작했으면 사용자만으로는 못 가려 이전 활동 값이 새 활동으로 나간다
      if (next != null && repository.exists(userId, next.activityId())) {
        send(next.crewId(), userId, "LIVE_UPDATE", next.update());
      }
    }
  }

  private void send(UUID crewId, UUID sender, String type, Object data) {
    SocketMessage message = new SocketMessage(type, data);
    repository
        .findRecipients(crewId, sender)
        .forEach(
            recipient ->
                messaging.convertAndSendToUser(
                    recipient.toString(), WebSocketConfig.CREW_QUEUE, message));
  }
}
