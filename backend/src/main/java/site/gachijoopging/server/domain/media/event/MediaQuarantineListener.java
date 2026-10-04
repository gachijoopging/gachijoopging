package site.gachijoopging.server.domain.media.event;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import site.gachijoopging.server.domain.media.client.MediaStorage;
import site.gachijoopging.server.domain.media.service.MediaService;

@Slf4j
@Component
@RequiredArgsConstructor
public class MediaQuarantineListener {

  private static final String forbiddenPrefix = "deleted/";

  private final MediaStorage mediaStorage;
  private final MediaService mediaService;

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onMediaQuarantine(MediaQuarantineEvent event) {
    event.keys().forEach(this::move);
  }

  private void move(String key) {
    String forbiddenKey = forbiddenPrefix + key;
    try {
      mediaStorage.move(key, forbiddenKey);
    } catch (RuntimeException e) {
      log.error("삭제된 콘텐츠의 사진을 옮기지 못했다 — 원래 경로에 남아 있다: {}", key, e);
      mediaService.quarantine(key, forbiddenKey);
    }
  }
}
