package site.gachijoopging.server.domain.live.service;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.live.repository.LiveLocationRepository;
import site.gachijoopging.server.domain.live.repository.LiveLocationRepository.StaleRow;
import site.gachijoopging.server.global.batch.BatchDelete;

@Slf4j
@Component
@RequiredArgsConstructor
public class LiveLocationCleanupJob {

  // 마지막 갱신 뒤 30분 안에 지운다(feature-scope 보존·정리). 5분마다 돌아서 5분 앞당긴다.
  // 지운 행은 LIVE_ENDED 로 알린다 — 목록을 이미 받은 크루원 화면에서도 빠져야 GET /crew/live 와 같아진다.
  // 활동이 이어지면 다음 보고가 행을 다시 만들고 LIVE_STARTED 로 알린다
  private static final Duration STALE_AFTER = Duration.ofMinutes(25);

  private final LiveLocationRepository liveLocationRepository;
  private final LiveBroadcaster broadcaster;
  private final BatchDelete batchDelete;
  private final Clock clock;

  @Scheduled(cron = "0 */5 * * * *")
  public int removeStaleLocations() {
    var threshold = clock.instant().minus(STALE_AFTER);
    List<StaleRow> removed = new ArrayList<>();
    // 배치마다 따로 커밋하므로, 뒤 배치가 실패해도 앞서 지운 행은 알린다. 실패한 배치의 행은 롤백돼
    // 남아 있어 endedIfGone 이 거른다
    try {
      batchDelete.untilDone(
          n -> {
            List<StaleRow> rows = liveLocationRepository.deleteStale(threshold, n);
            removed.addAll(rows);
            return rows.size();
          });
    } finally {
      removed.forEach(r -> broadcaster.endedIfGone(r.crewId(), r.userId(), r.activityId()));
    }
    if (!removed.isEmpty()) {
      log.info("갱신이 끊긴 실시간 위치 정리 — {}행", removed.size());
    }
    return removed.size();
  }
}
