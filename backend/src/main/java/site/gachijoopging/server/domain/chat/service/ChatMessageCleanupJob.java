package site.gachijoopging.server.domain.chat.service;

import java.time.Clock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.chat.repository.ChatMessageRepository;
import site.gachijoopging.server.global.batch.BatchDelete;
import site.gachijoopging.server.global.batch.RetentionProperties;

@Slf4j
@Component
@RequiredArgsConstructor
public class ChatMessageCleanupJob {

  private final ChatMessageRepository chatMessageRepository;
  private final BatchDelete batchDelete;
  private final Clock clock;
  private final RetentionProperties retention;

  @Scheduled(cron = "0 0 4 * * *", zone = "Asia/Seoul")
  public int removeDeletedMessages() {
    var threshold = clock.instant().minus(retention.softDeleted());
    int removed =
        batchDelete.untilDone(n -> chatMessageRepository.deleteDeletedBefore(threshold, n));
    if (removed > 0) {
      log.info("지운 지 30일 된 채팅 메시지 정리 — {}행", removed);
    }
    return removed;
  }
}
