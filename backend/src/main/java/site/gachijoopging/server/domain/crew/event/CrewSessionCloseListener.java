package site.gachijoopging.server.domain.crew.event;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import site.gachijoopging.server.global.websocket.CrewSessions;

// 롤백된 추방·나가기로 연결을 끊지 않게 커밋 뒤에 닫는다. 앱은 4403 을 받고 소속을 다시 읽는다
@Component
@RequiredArgsConstructor
public class CrewSessionCloseListener {

  private final CrewSessions crewSessions;

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onExpelled(MemberExpelledEvent event) {
    crewSessions.close(event.userId());
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onLeft(MemberLeftEvent event) {
    crewSessions.close(event.userId());
  }
}
