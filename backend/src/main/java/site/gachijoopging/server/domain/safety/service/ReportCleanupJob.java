package site.gachijoopging.server.domain.safety.service;

import java.time.Clock;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.safety.repository.ReportRepository;
import site.gachijoopging.server.global.batch.BatchDelete;
import site.gachijoopging.server.global.batch.RetentionProperties;

@Slf4j
@Component
@RequiredArgsConstructor
public class ReportCleanupJob {

  private final ReportRepository reportRepository;
  private final BatchDelete batchDelete;
  private final Clock clock;
  private final RetentionProperties retention;

  @Scheduled(cron = "0 0 4 * * *", zone = "Asia/Seoul")
  public int removeResolvedReports() {
    var threshold = clock.instant().minus(retention.resolvedReport());
    int removed = batchDelete.untilDone(n -> reportRepository.deleteResolvedBefore(threshold, n));
    if (removed > 0) {
      log.info("처리 끝난 신고 정리 — {}행", removed);
    }
    return removed;
  }
}
