package site.gachijoopging.server.domain.media.event;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import site.gachijoopging.server.domain.media.client.MediaStorage;

@Slf4j
@Component
@RequiredArgsConstructor
public class MediaPurgeListener {

  private static final String QUARANTINE_PREFIX = "deleted/";

  private final MediaStorage mediaStorage;

  // 직접 지운 콘텐츠의 사진은 deleted/ 로 옮겨져 있고, 옮기기에 실패했으면 DB 키만 deleted/ 로 바뀐 채
  // 파일은 원래 경로에 있다. 어느 쪽이든 두 경로를 다 지운다
  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void onMediaPurge(MediaPurgeEvent event) {
    event
        .keys()
        .forEach(
            key -> {
              String original =
                  key.startsWith(QUARANTINE_PREFIX)
                      ? key.substring(QUARANTINE_PREFIX.length())
                      : key;
              delete(original);
              delete(QUARANTINE_PREFIX + original);
            });
  }

  private void delete(String key) {
    try {
      mediaStorage.delete(key);
    } catch (RuntimeException e) {
      log.error("탈퇴한 사용자의 사진을 지우지 못했다: {}", key, e);
    }
  }
}
