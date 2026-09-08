package site.gachijoopging.server.domain.media.event;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.io.UncheckedIOException;
import java.util.List;
import org.junit.jupiter.api.Test;
import site.gachijoopging.server.domain.media.domain.service.MediaService;
import site.gachijoopging.server.domain.media.infrastructure.client.MediaStorage;

class MediaQuarantineListenerTest {

  private final MediaStorage storage = mock(MediaStorage.class);
  private final MediaService mediaService = mock(MediaService.class);
  private final MediaQuarantineListener listener =
      new MediaQuarantineListener(storage, mediaService);

  @Test
  void 키마다_deleted_를_앞에_붙여_옮긴다() {
    listener.onMediaQuarantine(
        new MediaQuarantineEvent(List.of("2026/08/사진.jpg", "2026/08/사진_thumb.jpg")));

    verify(storage).move("2026/08/사진.jpg", "deleted/2026/08/사진.jpg");
    verify(storage).move("2026/08/사진_thumb.jpg", "deleted/2026/08/사진_thumb.jpg");
  }

  @Test
  void 한_키가_실패해도_나머지를_옮기고_예외를_내보내지_않는다() {
    doThrow(new UncheckedIOException("없다", new java.io.IOException()))
        .when(storage)
        .move("깨진/사진.jpg", "deleted/깨진/사진.jpg");

    assertThatCode(
            () ->
                listener.onMediaQuarantine(
                    new MediaQuarantineEvent(List.of("깨진/사진.jpg", "멀쩡한/사진.jpg"))))
        .doesNotThrowAnyException();

    verify(storage).move("멀쩡한/사진.jpg", "deleted/멀쩡한/사진.jpg");
  }

  @Test
  void 이동에_실패하면_그_키를_접근_불가로_표시한다() {
    doThrow(new UncheckedIOException("없다", new java.io.IOException()))
        .when(storage)
        .move("깨진/사진.jpg", "deleted/깨진/사진.jpg");

    listener.onMediaQuarantine(new MediaQuarantineEvent(List.of("깨진/사진.jpg")));

    verify(mediaService).quarantine("깨진/사진.jpg", "deleted/깨진/사진.jpg");
  }

  @Test
  void 이동에_성공하면_저장_키를_건드리지_않는다() {
    listener.onMediaQuarantine(new MediaQuarantineEvent(List.of("멀쩡한/사진.jpg")));

    verifyNoInteractions(mediaService);
  }
}
