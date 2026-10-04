package site.gachijoopging.server.domain.media.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import site.gachijoopging.server.domain.media.repository.MediaRepository;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

@ExtendWith(MockitoExtension.class)
class MediaServiceTest {

  private static final Instant NOW = Instant.parse("2026-08-04T05:00:00Z");

  private static final UUID 나 = UUID.fromString("11111111-1111-1111-1111-111111111111");

  @Mock private MediaRepository mediaRepository;

  private MediaService mediaService() {
    return new MediaService(mediaRepository, Clock.fixed(NOW, ZoneOffset.UTC));
  }

  @Test
  void 한도_미만이면_통과한다() {
    when(mediaRepository.countByOwnerIdAndCreatedAtGreaterThanEqual(eq(나), any())).thenReturn(299L);

    assertThatCode(() -> mediaService().checkDailyQuota(나)).doesNotThrowAnyException();
  }

  @Test
  void 일일_300장을_채우면_RATE_LIMITED_다() {
    when(mediaRepository.countByOwnerIdAndCreatedAtGreaterThanEqual(eq(나), any())).thenReturn(300L);

    assertThatThrownBy(() -> mediaService().checkDailyQuota(나))
        .isInstanceOf(BusinessException.class)
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.RATE_LIMITED);
  }

  @Test
  void KST_자정부터_센다() {
    when(mediaRepository.countByOwnerIdAndCreatedAtGreaterThanEqual(eq(나), any())).thenReturn(0L);

    mediaService().checkDailyQuota(나);

    ArgumentCaptor<Instant> 기준 = ArgumentCaptor.forClass(Instant.class);
    verify(mediaRepository).countByOwnerIdAndCreatedAtGreaterThanEqual(eq(나), 기준.capture());
    assertThat(기준.getValue()).isEqualTo(Instant.parse("2026-08-03T15:00:00Z"));
  }

  @Test
  void Retry_After_는_KST_자정까지_남은_초다() {
    when(mediaRepository.countByOwnerIdAndCreatedAtGreaterThanEqual(eq(나), any())).thenReturn(300L);

    assertThatThrownBy(() -> mediaService().checkDailyQuota(나))
        .extracting(e -> ((BusinessException) e).retryAfterSeconds())
        .isEqualTo(10 * 3600L);
  }
}
