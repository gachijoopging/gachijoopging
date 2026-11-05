package site.gachijoopging.server.domain.live;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import site.gachijoopging.server.domain.live.repository.LiveLocationRepository;
import site.gachijoopging.server.domain.live.repository.LiveLocationRepository.StaleRow;
import site.gachijoopging.server.domain.live.service.LiveBroadcaster;
import site.gachijoopging.server.domain.live.service.LiveLocationCleanupJob;
import site.gachijoopging.server.global.batch.BatchDelete;

class LiveLocationCleanupBatchFailureTest {

  @Test
  void 뒤_배치가_실패해도_앞서_커밋한_배치의_행은_LIVE_ENDED_로_알린다() {
    LiveLocationRepository repository = mock(LiveLocationRepository.class);
    LiveBroadcaster broadcaster = mock(LiveBroadcaster.class);
    StaleRow 지운_행 = new StaleRow(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
    when(repository.deleteStale(any(), anyInt()))
        .thenReturn(List.of(지운_행))
        .thenThrow(new IllegalStateException("DB 장애"));
    var job =
        new LiveLocationCleanupJob(
            repository,
            broadcaster,
            new BatchDelete(mock(PlatformTransactionManager.class)),
            Clock.systemUTC());

    assertThatThrownBy(job::removeStaleLocations).hasMessage("DB 장애");

    verify(broadcaster).endedIfGone(지운_행.crewId(), 지운_행.userId(), 지운_행.activityId());
  }
}
