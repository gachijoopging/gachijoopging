package site.gachijoopging.server.domain.auth.service;

import java.time.Clock;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.auth.repository.PasswordResetTokenRepository;
import site.gachijoopging.server.global.batch.BatchDelete;

@Slf4j
@Component
@RequiredArgsConstructor
public class PasswordResetTokenCleanupJob {

  private final PasswordResetTokenRepository tokenRepository;
  private final BatchDelete batchDelete;
  private final Clock clock;

  @Scheduled(cron = "0 0 4 * * *", zone = "Asia/Seoul")
  public int removeExpiredTokens() {
    Instant now = clock.instant();
    int removed = batchDelete.untilDone(n -> tokenRepository.deleteExpired(now, n));
    if (removed > 0) {
      log.info("만료 비밀번호 재설정 토큰 정리 — {}행", removed);
    }
    return removed;
  }
}
