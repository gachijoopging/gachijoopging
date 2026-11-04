package site.gachijoopging.server.domain.live.service;

import java.time.Clock;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.live.repository.LiveLocationRepository;
import site.gachijoopging.server.global.batch.BatchDelete;

@Slf4j
@Component
@RequiredArgsConstructor
public class LiveLocationCleanupJob {

  // 마지막 갱신 뒤 30분 안에 지운다(feature-scope 보존·정리). 5분마다 돌아서 5분 앞당긴다.
  // LIVE_ENDED 는 보내지 않는다 — 활동이 끝난 게 아니라 갱신이 끊긴 것이고, 이어지면 다음 갱신이 행을 다시 만든다
  private static final Duration STALE_AFTER = Duration.ofMinutes(25);

  private final LiveLocationRepository liveLocationRepository;
  private final BatchDelete batchDelete;
  private final Clock clock;

  @Scheduled(cron = "0 */5 * * * *")
  public int removeStaleLocations() {
    var threshold = clock.instant().minus(STALE_AFTER);
    int removed = batchDelete.untilDone(n -> liveLocationRepository.deleteStale(threshold, n));
    if (removed > 0) {
      log.info("갱신이 끊긴 실시간 위치 정리 — {}행", removed);
    }
    return removed;
  }
}
