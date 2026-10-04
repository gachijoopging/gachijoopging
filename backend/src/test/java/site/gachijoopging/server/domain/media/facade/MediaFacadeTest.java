package site.gachijoopging.server.domain.media.facade;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import site.gachijoopging.server.domain.activity.entity.Category;
import site.gachijoopging.server.domain.media.client.AiInferenceClient;
import site.gachijoopging.server.domain.media.client.MediaStorage;
import site.gachijoopging.server.domain.media.client.Thumbnailer;
import site.gachijoopging.server.domain.media.dto.MediaDtos.BboxResponse;
import site.gachijoopging.server.domain.media.dto.MediaDtos.InferenceItemResponse;
import site.gachijoopging.server.domain.media.dto.MediaDtos.InferenceResponse;
import site.gachijoopging.server.domain.media.dto.MediaDtos.MediaUploadResponse;
import site.gachijoopging.server.domain.media.dto.MediaSummary;
import site.gachijoopging.server.domain.media.service.MediaImageValidator;
import site.gachijoopging.server.domain.media.service.MediaService;
import site.gachijoopging.server.domain.media.service.MediaSignedUrl;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MediaFacadeTest {

  private static final Instant NOW = Instant.parse("2026-08-04T05:00:00Z");
  private static final UUID 나 = UUID.fromString("11111111-1111-1111-1111-111111111111");
  private static final UUID MEDIA_ID = UUID.fromString("22222222-2222-2222-2222-222222222222");
  private static final byte[] 사진 = {(byte) 0xFF, (byte) 0xD8, 0x01};

  @Mock private MediaService mediaService;
  @Mock private MediaImageValidator validator;
  @Mock private MediaStorage storage;
  @Mock private Thumbnailer thumbnailer;
  @Mock private MediaSignedUrl signedUrl;
  @Mock private AiInferenceClient aiInferenceClient;

  private MediaFacade mediaFacade;

  @BeforeEach
  void setUp() {
    mediaFacade =
        new MediaFacade(
            mediaService,
            validator,
            storage,
            thumbnailer,
            signedUrl,
            aiInferenceClient,
            Clock.fixed(NOW, ZoneOffset.UTC));
    when(signedUrl.of(anyString())).thenAnswer(it -> "/media/" + it.getArgument(0) + "?s=서명");
    when(thumbnailer.of(any())).thenReturn(new byte[] {9});
  }

  @Test
  void 재전송이면_저장은_건너뛰고_추론은_다시_한다() {
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.of(이미_있는_사진(나)));
    when(aiInferenceClient.infer(사진)).thenReturn(담배꽁초_하나());

    MediaUploadResponse 응답 = mediaFacade.upload(나, MEDIA_ID, 사진);

    verify(storage, never()).store(anyString(), any());
    verify(mediaService, never()).create(any(), any(), anyString(), anyString());
    verify(aiInferenceClient).infer(사진);
    assertThat(응답.inference().status()).isEqualTo("OK");
    assertThat(응답.inference().items()).hasSize(1);
  }

  @Test
  void 재전송_응답은_이미_저장된_키의_url_이다() {
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.of(이미_있는_사진(나)));
    when(aiInferenceClient.infer(사진)).thenReturn(InferenceResponse.unavailable());

    MediaUploadResponse 응답 = mediaFacade.upload(나, MEDIA_ID, 사진);

    assertThat(응답.url()).contains("옛날/키.jpg");
    assertThat(응답.thumbUrl()).contains("옛날/키_thumb.jpg");
  }

  @Test
  void 재전송이라고_UNAVAILABLE_로_때우지_않는다() {
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.of(이미_있는_사진(나)));
    when(aiInferenceClient.infer(사진)).thenReturn(담배꽁초_하나());

    MediaUploadResponse 응답 = mediaFacade.upload(나, MEDIA_ID, 사진);

    assertThat(응답.inference().status()).isNotEqualTo("UNAVAILABLE");
  }

  @Test
  void 신규면_원본과_썸네일을_저장하고_행을_만든다() {
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.empty());
    when(aiInferenceClient.infer(사진)).thenReturn(담배꽁초_하나());
    when(mediaService.create(any(), any(), anyString(), anyString())).thenReturn(새로_만든_사진());

    mediaFacade.upload(나, MEDIA_ID, 사진);

    verify(storage).store("2026/08/" + MEDIA_ID + ".jpg", 사진);
    verify(storage).store("2026/08/" + MEDIA_ID + "_thumb.jpg", new byte[] {9});
    verify(mediaService)
        .create(MEDIA_ID, 나, "2026/08/" + MEDIA_ID + ".jpg", "2026/08/" + MEDIA_ID + "_thumb.jpg");
  }

  @Test
  void AI_에는_가공하지_않은_원본을_보낸다() {
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.empty());
    when(aiInferenceClient.infer(any())).thenReturn(담배꽁초_하나());
    when(mediaService.create(any(), any(), anyString(), anyString())).thenReturn(새로_만든_사진());

    mediaFacade.upload(나, MEDIA_ID, 사진);

    verify(aiInferenceClient).infer(사진);
  }

  @Test
  void AI가_죽어도_사진은_저장되고_url_은_정상이다() {
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.empty());
    when(aiInferenceClient.infer(사진)).thenReturn(InferenceResponse.unavailable());
    when(mediaService.create(any(), any(), anyString(), anyString())).thenReturn(새로_만든_사진());

    MediaUploadResponse 응답 = mediaFacade.upload(나, MEDIA_ID, 사진);

    verify(storage).store("2026/08/" + MEDIA_ID + ".jpg", 사진);
    assertThat(응답.url()).isNotBlank();
    assertThat(응답.thumbUrl()).isNotBlank();
    assertThat(응답.inference().status()).isEqualTo("UNAVAILABLE");
    assertThat(응답.inference().items()).isNull();
  }

  @Test
  void 남의_mediaId_를_재전송하면_403_이다() {
    UUID 남 = UUID.fromString("33333333-3333-3333-3333-333333333333");
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.of(이미_있는_사진(남)));

    assertThatThrownBy(() -> mediaFacade.upload(나, MEDIA_ID, 사진))
        .isInstanceOf(BusinessException.class)
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.FORBIDDEN);
  }

  @Test
  void 남의_mediaId_면_추론도_하지_않는다() {
    UUID 남 = UUID.fromString("33333333-3333-3333-3333-333333333333");
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.of(이미_있는_사진(남)));

    try {
      mediaFacade.upload(나, MEDIA_ID, 사진);
    } catch (BusinessException expected) {
    }

    verify(aiInferenceClient, never()).infer(any());
  }

  private static MediaSummary 이미_있는_사진(UUID owner) {
    return new MediaSummary(MEDIA_ID, owner, "옛날/키.jpg", "옛날/키_thumb.jpg");
  }

  private static MediaSummary 새로_만든_사진() {
    return new MediaSummary(
        MEDIA_ID, 나, "2026/08/" + MEDIA_ID + ".jpg", "2026/08/" + MEDIA_ID + "_thumb.jpg");
  }

  private static InferenceResponse 담배꽁초_하나() {
    return InferenceResponse.ok(
        "yolo26s-1024-v1",
        94,
        List.of(
            new InferenceItemResponse(
                new BboxResponse(0.31, 0.44, 0.12, 0.09), Category.CIGARETTE, 0.93)));
  }
}
