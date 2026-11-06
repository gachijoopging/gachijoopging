package site.gachijoopging.server.domain.safety.service;

import java.time.Clock;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.safety.repository.ReportRepository;
import site.gachijoopging.server.global.batch.BatchDelete;

@Slf4j
@Component
@RequiredArgsConstructor
public class ReportCleanupJob {

  // 처리 끝난 뒤 1년(privacy §2). 매일 돌아서 하루 앞당겨야 1년을 넘기지 않는다
  private static final Duration RETENTION = Duration.ofDays(364);

  private final ReportRepository reportRepository;
  private final BatchDelete batchDelete;
  private final Clock clock;

  @Scheduled(cron = "0 0 4 * * *", zone = "Asia/Seoul")
  public int removeResolvedReports() {
    var threshold = clock.instant().minus(RETENTION);
    int removed = batchDelete.untilDone(n -> reportRepository.deleteResolvedBefore(threshold, n));
    if (removed > 0) {
      log.info("처리 끝난 신고 정리 — {}행", removed);
    }
    return removed;
  }
}
