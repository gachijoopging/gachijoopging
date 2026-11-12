package site.gachijoopging.server.domain.notice.service;

import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.notice.repository.NoticeCommentRepository;
import site.gachijoopging.server.domain.notice.repository.NoticeRepository;
import site.gachijoopging.server.global.batch.BatchDelete;

@Slf4j
@Component
@RequiredArgsConstructor
public class NoticeCleanupJob {

  // 지운 뒤 30일 안에 완전히 지운다(privacy §2). 매일 돌아서 하루 앞당겨야 30일을 넘기지 않는다
  private static final Duration RETENTION = Duration.ofDays(29);

  private final NoticeRepository noticeRepository;
  private final NoticeCommentRepository noticeCommentRepository;
  private final BatchDelete batchDelete;
  private final Clock clock;

  @Scheduled(cron = "0 0 4 * * *", zone = "Asia/Seoul")
  public int removeDeletedNotices() {
    var threshold = clock.instant().minus(RETENTION);
    int notices =
        batchDelete.untilDone(
            n -> {
              List<UUID> ids = noticeRepository.findDeletedBefore(threshold, n);
              return ids.isEmpty() ? 0 : noticeRepository.purge(ids);
            });
    int comments =
        batchDelete.untilDone(n -> noticeCommentRepository.deleteDeletedBefore(threshold, n));
    if (notices + comments > 0) {
      log.info("지운 지 30일 된 공지 {}행 · 공지 댓글 {}행 정리", notices, comments);
    }
    return notices + comments;
  }
}
