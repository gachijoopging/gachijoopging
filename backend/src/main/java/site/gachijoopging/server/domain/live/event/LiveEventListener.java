package site.gachijoopging.server.domain.live.event;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import site.gachijoopging.server.domain.live.service.LiveBroadcaster;
import site.gachijoopging.server.domain.live.service.LiveService;

// 롤백된 시작·갱신·종료를 크루원에게 알리지 않게 커밋 뒤에 보낸다
@Component
@RequiredArgsConstructor
public class LiveEventListener {

  private final LiveService liveService;
  private final LiveBroadcaster broadcaster;

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onStarted(LiveStartedEvent event) {
    liveService
        .member(event.userId())
        .ifPresent(member -> broadcaster.started(event.crewId(), event.userId(), member));
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onUpdated(LiveUpdatedEvent event) {
    broadcaster.update(event.crewId(), event.userId(), event.activityId(), event.update());
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onEnded(LiveEndedEvent event) {
    broadcaster.ended(event.crewId(), event.userId(), event.activityId());
  }
}
