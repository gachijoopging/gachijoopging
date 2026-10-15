package site.gachijoopging.server.domain.media.facade;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
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
import site.gachijoopging.server.domain.activity.dto.ActivityPhotoRef;
import site.gachijoopging.server.domain.activity.entity.Category;
import site.gachijoopging.server.domain.activity.service.ActivityService;
import site.gachijoopging.server.domain.media.client.AiInferenceClient;
import site.gachijoopging.server.domain.media.client.MediaStorage;
import site.gachijoopging.server.domain.media.client.Thumbnailer;
import site.gachijoopging.server.domain.media.dto.MediaDtos.BboxResponse;
import site.gachijoopging.server.domain.media.dto.MediaDtos.InferenceItemResponse;
import site.gachijoopging.server.domain.media.dto.MediaDtos.InferenceResponse;
import site.gachijoopging.server.domain.media.dto.MediaDtos.MediaUploadResponse;
import site.gachijoopging.server.domain.media.dto.MediaSummary;
import site.gachijoopging.server.domain.media.dto.MediaUpload;
import site.gachijoopging.server.domain.media.entity.MediaPurpose;
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
  private static final UUID 활동 = UUID.fromString("44444444-4444-4444-4444-444444444444");
  private static final UUID 사진_ID = UUID.fromString("55555555-5555-5555-5555-555555555555");
  private static final byte[] 사진 = {(byte) 0xFF, (byte) 0xD8, 0x01};

  @Mock private MediaService mediaService;
  @Mock private ActivityService activityService;
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
            activityService,
            validator,
            storage,
            thumbnailer,
            signedUrl,
            aiInferenceClient,
            Clock.fixed(NOW, ZoneOffset.UTC));
    when(validator.validate(any())).thenReturn(true);
    when(signedUrl.of(anyString())).thenAnswer(it -> "/media/" + it.getArgument(0) + "?s=서명");
    when(thumbnailer.of(any())).thenReturn(new byte[] {9});
  }

  @Test
  void 활동_사진이면_원본과_썸네일을_저장하고_추론해_사진_행과_함께_만든다() {
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.empty());
    when(aiInferenceClient.infer(사진)).thenReturn(담배꽁초_하나());
    받은_키로_만든다(사진_ID);

    MediaUploadResponse 응답 = mediaFacade.upload(나, 활동_사진());

    verify(activityService).requirePhotoTarget(나, 활동);
    verify(storage).store(argThat(MediaFacadeTest::원본_키다), eq(사진));
    verify(storage).store(argThat(MediaFacadeTest::썸네일_키다), eq(new byte[] {9}));
    verify(storage, never()).delete(anyString());
    assertThat(응답.photoId()).isEqualTo(사진_ID.toString());
    assertThat(응답.inference().items()).hasSize(1);
  }

  @Test
  void 활동이_아니면_추론하지_않고_사진_행도_없다() {
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.empty());
    when(mediaService.create(
            eq(MEDIA_ID), eq(나), eq(MediaPurpose.PROFILE), anyString(), anyString(), isNull()))
        .thenAnswer(
            it ->
                new MediaService.Saved(
                    받은_키(MediaPurpose.PROFILE, it.getArgument(3), it.getArgument(4)), null));

    MediaUploadResponse 응답 =
        mediaFacade.upload(
            나, new MediaUpload(MEDIA_ID, 사진, MediaPurpose.PROFILE, null, null, null, null));

    verify(aiInferenceClient, never()).infer(any());
    assertThat(응답.photoId()).isNull();
    assertThat(응답.inference()).isNull();
  }

  @Test
  void 끝난_활동이면_파일을_저장하기_전에_멈춘다() {
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.empty());
    doThrow(new BusinessException(ErrorCode.NOT_FOUND, "끝난 활동이다"))
        .when(activityService)
        .requirePhotoTarget(나, 활동);

    assertThatThrownBy(() -> mediaFacade.upload(나, 활동_사진())).isInstanceOf(BusinessException.class);

    verify(storage, never()).store(anyString(), any());
  }

  @Test
  void 행을_만들다_실패하면_저장한_파일을_지운다() {
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.empty());
    when(aiInferenceClient.infer(사진)).thenReturn(InferenceResponse.unavailable());
    when(mediaService.create(any(), any(), any(), anyString(), anyString(), any()))
        .thenThrow(new BusinessException(ErrorCode.NOT_FOUND, "끝난 활동이다"));

    assertThatThrownBy(() -> mediaFacade.upload(나, 활동_사진())).isInstanceOf(BusinessException.class);

    verify(storage).delete(argThat(MediaFacadeTest::원본_키다));
    verify(storage).delete(argThat(MediaFacadeTest::썸네일_키다));
  }

  @Test
  void 같은_사람의_동시_재전송이_먼저_행을_만들었으면_이번_시도의_파일을_지운다() {
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.empty());
    when(aiInferenceClient.infer(사진)).thenReturn(담배꽁초_하나());
    when(mediaService.create(any(), any(), any(), anyString(), anyString(), any()))
        .thenReturn(new MediaService.Saved(이미_있는_사진(나), 사진_ID));

    MediaUploadResponse 응답 = mediaFacade.upload(나, 활동_사진());

    verify(storage).delete(argThat(MediaFacadeTest::원본_키다));
    verify(storage).delete(argThat(MediaFacadeTest::썸네일_키다));
    assertThat(응답.url()).contains("옛날/키.jpg");
  }

  @Test
  void JPEG_가_아니면_바꾼_JPEG_를_저장하고_추론한다() {
    byte[] 바꾼_것 = {(byte) 0xFF, (byte) 0xD8, 0x07};
    when(validator.validate(사진)).thenReturn(false);
    when(thumbnailer.toJpeg(사진)).thenReturn(바꾼_것);
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.empty());
    when(aiInferenceClient.infer(바꾼_것)).thenReturn(담배꽁초_하나());
    받은_키로_만든다(사진_ID);

    mediaFacade.upload(나, 활동_사진());

    verify(storage).store(argThat(MediaFacadeTest::원본_키다), eq(바꾼_것));
    verify(aiInferenceClient).infer(바꾼_것);
  }

  @Test
  void 재전송은_저장하지_않고_실려_온_파일로_다시_추론한다() {
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.of(이미_있는_사진(나)));
    when(activityService.photoOf(MEDIA_ID))
        .thenReturn(Optional.of(new ActivityPhotoRef(사진_ID, 활동)));
    when(aiInferenceClient.infer(사진)).thenReturn(담배꽁초_하나());

    MediaUploadResponse 응답 = mediaFacade.upload(나, 활동_사진());

    verify(storage, never()).store(anyString(), any());
    verify(mediaService, never()).create(any(), any(), any(), anyString(), anyString(), any());
    verify(activityService).requirePhotoTarget(나, 활동);
    assertThat(응답.photoId()).isEqualTo(사진_ID.toString());
    assertThat(응답.inference().status()).isEqualTo("OK");
    assertThat(응답.url()).contains("옛날/키.jpg");
  }

  @Test
  void 남의_mediaId_를_재전송하면_403_이고_추론하지_않는다() {
    UUID 남 = UUID.fromString("33333333-3333-3333-3333-333333333333");
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.of(이미_있는_사진(남)));

    assertThatThrownBy(() -> mediaFacade.upload(나, 활동_사진()))
        .isInstanceOf(BusinessException.class)
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.FORBIDDEN);
    verify(aiInferenceClient, never()).infer(any());
  }

  @Test
  void 남의_mediaId_재전송은_PNG_를_JPEG_로_바꾸지도_않는다() {
    UUID 남 = UUID.fromString("33333333-3333-3333-3333-333333333333");
    when(validator.validate(사진)).thenReturn(false);
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.of(이미_있는_사진(남)));

    assertThatThrownBy(() -> mediaFacade.upload(나, 활동_사진())).isInstanceOf(BusinessException.class);

    verify(thumbnailer, never()).toJpeg(any());
  }

  @Test
  void 활동_사진으로_올린_mediaId_를_다른_용도로_재전송하면_409_다() {
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.of(이미_있는_사진(나)));

    assertThatThrownBy(
            () ->
                mediaFacade.upload(
                    나, new MediaUpload(MEDIA_ID, 사진, MediaPurpose.PROFILE, null, null, null, null)))
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.CONFLICT);
  }

  @Test
  void 끝난_활동의_사진을_재전송하면_추론하지_않고_멈춘다() {
    when(mediaService.find(MEDIA_ID)).thenReturn(Optional.of(이미_있는_사진(나)));
    when(activityService.photoOf(MEDIA_ID))
        .thenReturn(Optional.of(new ActivityPhotoRef(사진_ID, 활동)));
    doThrow(new BusinessException(ErrorCode.NOT_FOUND, "끝난 활동이다"))
        .when(activityService)
        .requirePhotoTarget(나, 활동);

    assertThatThrownBy(() -> mediaFacade.upload(나, 활동_사진()))
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.NOT_FOUND);
    verify(aiInferenceClient, never()).infer(any());
  }

  @Test
  void 활동_사진에_activityId_가_없거나_lat_만_있거나_NaN_이면_422_다() {
    assertThatThrownBy(
            () ->
                mediaFacade.upload(
                    나,
                    new MediaUpload(MEDIA_ID, 사진, MediaPurpose.ACTIVITY, null, null, null, null)))
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.VALIDATION);
    assertThatThrownBy(
            () ->
                mediaFacade.upload(
                    나, new MediaUpload(MEDIA_ID, 사진, MediaPurpose.ACTIVITY, 활동, null, 37.5, null)))
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.VALIDATION);
    assertThatThrownBy(
            () ->
                mediaFacade.upload(
                    나,
                    new MediaUpload(
                        MEDIA_ID, 사진, MediaPurpose.ACTIVITY, 활동, null, Double.NaN, 127.0)))
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.VALIDATION);
  }

  @Test
  void 지우면_커밋된_뒤_원본과_썸네일_파일을_지운다() {
    when(mediaService.delete(나, MEDIA_ID)).thenReturn(Optional.of(이미_있는_사진(나)));

    mediaFacade.delete(나, MEDIA_ID);

    verify(storage).delete("옛날/키.jpg");
    verify(storage).delete("옛날/키_thumb.jpg");
  }

  private static MediaUpload 활동_사진() {
    return new MediaUpload(MEDIA_ID, 사진, MediaPurpose.ACTIVITY, 활동, null, null, null);
  }

  private static MediaSummary 이미_있는_사진(UUID owner) {
    return new MediaSummary(MEDIA_ID, owner, MediaPurpose.ACTIVITY, "옛날/키.jpg", "옛날/키_thumb.jpg");
  }

  private void 받은_키로_만든다(UUID photoId) {
    when(mediaService.create(any(), any(), any(), anyString(), anyString(), any()))
        .thenAnswer(
            it ->
                new MediaService.Saved(
                    받은_키(MediaPurpose.ACTIVITY, it.getArgument(3), it.getArgument(4)), photoId));
  }

  private static MediaSummary 받은_키(MediaPurpose purpose, String objectKey, String thumbKey) {
    return new MediaSummary(MEDIA_ID, 나, purpose, objectKey, thumbKey);
  }

  private static boolean 원본_키다(String key) {
    return key.startsWith("2026/08/" + MEDIA_ID + "-") && !key.endsWith("_thumb.jpg");
  }

  private static boolean 썸네일_키다(String key) {
    return key.startsWith("2026/08/" + MEDIA_ID + "-") && key.endsWith("_thumb.jpg");
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
