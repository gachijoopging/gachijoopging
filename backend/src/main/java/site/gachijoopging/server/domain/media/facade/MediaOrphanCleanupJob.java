package site.gachijoopging.server.domain.media.facade;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.media.client.MediaStorage;
import site.gachijoopging.server.domain.media.client.StoredFile;
import site.gachijoopging.server.domain.media.service.MediaService;

@Slf4j
@Component
@RequiredArgsConstructor
public class MediaOrphanCleanupJob {

  private static final String QUARANTINE_PREFIX = "deleted/";

  // 업로드는 파일을 먼저 쓰고 추론을 기다린 뒤 행을 커밋한다(몇 초). 그 사이의 파일을 지우지 않으려고 넉넉히 둔다
  private static final Duration GRACE = Duration.ofHours(1);

  private final MediaStorage storage;
  private final MediaService mediaService;
  private final Clock clock;

  @Scheduled(cron = "0 30 4 * * *", zone = "Asia/Seoul")
  public int removeOrphans() {
    Instant cutoff = clock.instant().minus(GRACE);
    int removed = 0;
    for (String folder : storage.monthFolders()) {
      Set<String> referenced =
          mediaService.referencedKeysIn(unquarantined(folder)).stream()
              .map(MediaOrphanCleanupJob::unquarantined)
              .collect(Collectors.toSet());
      for (StoredFile file : storage.files(folder)) {
        if (file.modifiedAt().isBefore(cutoff)
            && !referenced.contains(unquarantined(file.key()))
            && delete(file.key())) {
          removed++;
        }
      }
    }
    if (removed > 0) {
      log.info("고아 사진 파일 정리 — {}개", removed);
    }
    return removed;
  }

  private boolean delete(String key) {
    try {
      storage.delete(key);
      return true;
    } catch (RuntimeException e) {
      log.error("고아 사진 파일을 지우지 못했다 — 디스크에 남아 있다: {}", key, e);
      return false;
    }
  }

  private static String unquarantined(String key) {
    return key.startsWith(QUARANTINE_PREFIX) ? key.substring(QUARANTINE_PREFIX.length()) : key;
  }
}
