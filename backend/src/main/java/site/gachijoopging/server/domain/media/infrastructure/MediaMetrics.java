package site.gachijoopging.server.domain.media.infrastructure;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PostConstruct;
import java.util.function.ToDoubleFunction;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.media.infrastructure.persistence.MediaRepository;
import site.gachijoopging.server.global.metrics.GachijoopgingMetrics;

@Component
@RequiredArgsConstructor
public class MediaMetrics {

  public static final String USER_MODULE = "user";
  public static final String POST_MODULE = "post";
  public static final String ACTIVITY_MODULE = "activity";

  private final MediaRepository mediaRepository;
  private final MeterRegistry meterRegistry;

  @PostConstruct
  public void bind() {
    Gauge.builder(
            GachijoopgingMetrics.MEDIA_FILE, mediaRepository, repository -> repository.count())
        .description("media 행 수")
        .register(meterRegistry);

    refGauge(USER_MODULE, MediaRepository::countReferencedByUsers);
    refGauge(POST_MODULE, MediaRepository::countReferencedByPosts);
    refGauge(ACTIVITY_MODULE, MediaRepository::countReferencedByActivities);
  }

  private void refGauge(String module, ToDoubleFunction<MediaRepository> countOf) {
    Gauge.builder(GachijoopgingMetrics.MEDIA_REFERENCED, mediaRepository, countOf)
        .tag(GachijoopgingMetrics.MODULE, module)
        .description("모듈이 참조하는 미디어 수")
        .register(meterRegistry);
  }
}
