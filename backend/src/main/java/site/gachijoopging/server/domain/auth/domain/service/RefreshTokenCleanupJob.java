package site.gachijoopging.server.domain.auth.domain.service;

import java.time.Clock;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.auth.infrastructure.persistence.RefreshTokenRepository;

@Slf4j
@Component
@RequiredArgsConstructor
public class RefreshTokenCleanupJob {

  private static final Duration RETENTION = Duration.ofDays(30);

  private final RefreshTokenRepository refreshTokenRepository;
  private final Clock clock;

  @Transactional
  @Scheduled(cron = "0 0 4 * * *", zone = "Asia/Seoul")
  public int removeExpiredTokens() {
    int removed = refreshTokenRepository.deleteExpiredBefore(clock.instant().minus(RETENTION));
    if (removed > 0) {
      log.info("만료 refresh 토큰 정리 — {}행", removed);
    }
    return removed;
  }
}
