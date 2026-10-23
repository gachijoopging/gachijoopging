package site.gachijoopging.server.domain.media.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import site.gachijoopging.server.domain.activity.service.ActivityService;
import site.gachijoopging.server.domain.media.repository.MediaRepository;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.ratelimit.RateLimiter;

@ExtendWith(MockitoExtension.class)
class MediaServiceTest {

  private static final Instant NOW = Instant.parse("2026-08-04T05:00:00Z");

  private static final UUID 나 = UUID.fromString("11111111-1111-1111-1111-111111111111");

  @Mock private MediaRepository mediaRepository;
  @Mock private ActivityService activityService;
  @Mock private RateLimiter rateLimiter;

  private MediaService mediaService() {
    return new MediaService(
        mediaRepository, activityService, rateLimiter, Clock.fixed(NOW, ZoneOffset.UTC));
  }

  @Test
  void 한도_안이면_통과한다() {
    when(rateLimiter.tryAcquire(anyString(), eq(300), any())).thenReturn(true);

    assertThatCode(() -> mediaService().checkDailyQuota(나)).doesNotThrowAnyException();
  }

  @Test
  void 일일_300장을_채우면_RATE_LIMITED_이고_Retry_After_는_KST_자정까지_남은_초다() {
    when(rateLimiter.tryAcquire(anyString(), eq(300), any())).thenReturn(false);

    assertThatThrownBy(() -> mediaService().checkDailyQuota(나))
        .isInstanceOf(BusinessException.class)
        .satisfies(
            e -> {
              assertThat(((BusinessException) e).errorCode()).isEqualTo(ErrorCode.RATE_LIMITED);
              assertThat(((BusinessException) e).retryAfterSeconds()).isEqualTo(10 * 3600L);
            });
  }

  @Test
  void KST_날짜별로_세고_자정에_만료된다() {
    when(rateLimiter.tryAcquire(anyString(), eq(300), any())).thenReturn(true);

    mediaService().checkDailyQuota(나);

    verify(rateLimiter).tryAcquire("media:daily:" + 나 + ":2026-08-04", 300, Duration.ofHours(10));
  }
}
