package site.gachijoopging.server.domain.chat.service;

import java.time.Clock;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.chat.repository.ChatMessageRepository;
import site.gachijoopging.server.global.batch.BatchDelete;

@Slf4j
@Component
@RequiredArgsConstructor
public class ChatMessageCleanupJob {

  // 지운 뒤 30일 안에 완전히 지운다(privacy §2). 매일 돌아서 하루 앞당겨야 30일을 넘기지 않는다
  private static final Duration RETENTION = Duration.ofDays(29);

  private final ChatMessageRepository chatMessageRepository;
  private final BatchDelete batchDelete;
  private final Clock clock;

  @Scheduled(cron = "0 0 4 * * *", zone = "Asia/Seoul")
  public int removeDeletedMessages() {
    var threshold = clock.instant().minus(RETENTION);
    int removed =
        batchDelete.untilDone(n -> chatMessageRepository.deleteDeletedBefore(threshold, n));
    if (removed > 0) {
      log.info("지운 지 30일 된 채팅 메시지 정리 — {}행", removed);
    }
    return removed;
  }
}
