package site.gachijoopging.server.domain.activity.service;

import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.activity.repository.ActivityRepository;
import site.gachijoopging.server.domain.media.event.MediaReleaseEvent;
import site.gachijoopging.server.global.batch.BatchDelete;

@Slf4j
@Component
@RequiredArgsConstructor
public class ActivityCleanupJob {

  // 지운 뒤 30일 안에 완전히 지운다(privacy §2). 매일 돌아서 하루 앞당겨야 30일을 넘기지 않는다
  private static final Duration RETENTION = Duration.ofDays(29);

  private final ActivityRepository activityRepository;
  private final ApplicationEventPublisher events;
  private final BatchDelete batchDelete;
  private final Clock clock;

  @Scheduled(cron = "0 0 4 * * *", zone = "Asia/Seoul")
  public int removeDeletedActivities() {
    var threshold = clock.instant().minus(RETENTION);
    int removed =
        batchDelete.untilDone(
            n -> {
              List<UUID> ids = activityRepository.findDeletedBefore(threshold, n);
              if (ids.isEmpty()) {
                return 0;
              }
              // 사진 연결은 활동과 함께 지워지므로 먼저 읽어 둔다
              List<UUID> mediaIds = activityRepository.findPhotoMediaIds(ids);
              activityRepository.purge(ids);
              events.publishEvent(new MediaReleaseEvent(mediaIds));
              return ids.size();
            });
    if (removed > 0) {
      log.info("지운 지 30일 된 활동 정리 — {}행", removed);
    }
    return removed;
  }
}
