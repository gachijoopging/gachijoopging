package site.gachijoopging.server.domain.media.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import site.gachijoopging.server.domain.media.repository.MediaRepository;
import site.gachijoopging.server.global.metrics.GachijoopgingMetrics;

@ExtendWith(MockitoExtension.class)
class MediaMetricsTest {

  @Mock private MediaRepository mediaRepository;

  private SimpleMeterRegistry meterRegistry;

  @BeforeEach
  void setUp() {
    meterRegistry = new SimpleMeterRegistry();
  }

  @Test
  void 총량_게이지가_media_행_수를_낸다() {
    when(mediaRepository.count()).thenReturn(7L);
    new MediaMetrics(mediaRepository, meterRegistry).bind();

    assertThat(meterRegistry.get(GachijoopgingMetrics.MEDIA_FILE).gauge().value()).isEqualTo(7);
  }

  @Test
  void 참조_게이지가_모듈별로_나온다() {
    when(mediaRepository.countReferencedByUsers()).thenReturn(3L);
    when(mediaRepository.countReferencedByPosts()).thenReturn(5L);
    when(mediaRepository.countReferencedByActivities()).thenReturn(11L);
    new MediaMetrics(mediaRepository, meterRegistry).bind();

    assertThat(참조(MediaMetrics.USER_MODULE)).isEqualTo(3);
    assertThat(참조(MediaMetrics.POST_MODULE)).isEqualTo(5);
    assertThat(참조(MediaMetrics.ACTIVITY_MODULE)).isEqualTo(11);
  }

  @Test
  void 게이지는_스크레이프마다_다시_센다() {
    when(mediaRepository.count()).thenReturn(1L, 2L);
    new MediaMetrics(mediaRepository, meterRegistry).bind();

    assertThat(meterRegistry.get(GachijoopgingMetrics.MEDIA_FILE).gauge().value()).isEqualTo(1);
    assertThat(meterRegistry.get(GachijoopgingMetrics.MEDIA_FILE).gauge().value()).isEqualTo(2);
  }

  private double 참조(String 모듈) {
    return meterRegistry
        .get(GachijoopgingMetrics.MEDIA_REFERENCED)
        .tag(GachijoopgingMetrics.MODULE, 모듈)
        .gauge()
        .value();
  }
}
