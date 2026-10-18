package site.gachijoopging.server.domain.media.facade;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import site.gachijoopging.server.domain.activity.dto.ActivityPhotoRef;
import site.gachijoopging.server.domain.activity.dto.NewActivityPhoto;
import site.gachijoopging.server.domain.activity.service.ActivityService;
import site.gachijoopging.server.domain.media.client.AiInferenceClient;
import site.gachijoopging.server.domain.media.client.MediaStorage;
import site.gachijoopging.server.domain.media.client.Thumbnailer;
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

@Slf4j
@Service
@RequiredArgsConstructor
public class MediaFacade {

  private static final DateTimeFormatter monthFolder = DateTimeFormatter.ofPattern("yyyy/MM");
  private static final String EXTENSION = ".jpg";
  private static final String THUMBNAIL_SUFFIX = "_thumb";

  private final MediaService mediaService;
  private final ActivityService activityService;
  private final MediaImageValidator validator;
  private final MediaStorage storage;
  private final Thumbnailer thumbnailer;
  private final MediaSignedUrl signedUrl;
  private final AiInferenceClient aiInferenceClient;
  private final Clock clock;

  public MediaUploadResponse upload(UUID me, MediaUpload upload) {
    MediaService.requireShape(upload);
    // 계약의 takenAt 기본값은 서버가 받은 시각이라, 저장·추론을 기다리기 전에 잡아 둔다
    Instant received = clock.instant();
    boolean jpeg = validator.validate(upload.file());
    // PNG·WebP 변환은 비싸므로 거절하거나 결과를 버릴 요청(403·404·409·429·비활동 재전송)에서는 하지 않는다
    Supplier<byte[]> file = () -> jpeg ? upload.file() : thumbnailer.toJpeg(upload.file());
    return mediaService
        .find(upload.mediaId())
        .map(existing -> resend(me, upload, file, existing))
        .orElseGet(() -> fresh(me, upload, file, received));
  }

  /** 사용자가 버린 활동 사진을 지운다. 없는 mediaId 도 끝난 것으로 본다 — 앱 대기열이 재시도한다. */
  public void delete(UUID me, UUID mediaId) {
    mediaService
        .delete(me, mediaId)
        .ifPresent(media -> deleteFiles(media.objectKey(), media.thumbKey()));
  }

  private MediaUploadResponse resend(
      UUID me, MediaUpload upload, Supplier<byte[]> file, MediaSummary media) {
    if (!media.ownerId().equals(me)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "남의 mediaId 다");
    }
    MediaService.requireSamePurpose(media.purpose(), upload.purpose());
    if (upload.purpose() != MediaPurpose.ACTIVITY) {
      return response(media, null, null);
    }
    ActivityPhotoRef photo =
        activityService
            .photoOf(media.id())
            .filter(it -> it.activityId().equals(upload.activityId()))
            .orElseThrow(() -> new BusinessException(ErrorCode.CONFLICT, "다른 활동으로 올린 사진이다"));
    activityService.requirePhotoTarget(me, upload.activityId());
    // 재전송도 매번 추론하므로 세지 않으면 같은 mediaId 로 추론을 끝없이 부를 수 있다
    mediaService.checkDailyQuota(me);
    // 찾은 물체 목록은 저장하지 않으므로 실려 온 파일로 다시 추론한다 (02-conventions §8)
    return response(media, photo.photoId(), aiInferenceClient.infer(file.get()));
  }

  private MediaUploadResponse fresh(
      UUID me, MediaUpload upload, Supplier<byte[]> converted, Instant received) {
    boolean activity = upload.purpose() == MediaPurpose.ACTIVITY;
    if (activity) {
      activityService.requirePhotoTarget(me, upload.activityId());
    }
    mediaService.checkDailyQuota(me);
    byte[] file = converted.get();

    // 같은 mediaId 가 동시에 들어와도 서로의 파일을 덮거나 지우지 않도록 시도마다 다른 파일에 쓴다
    String attempt = UUID.randomUUID().toString().substring(0, 8);
    String objectKey = key(upload.mediaId(), attempt, "");
    String thumbKey = key(upload.mediaId(), attempt, THUMBNAIL_SUFFIX);
    InferenceResponse inference;
    MediaService.Saved saved;
    try {
      storage.store(objectKey, file);
      storage.store(thumbKey, thumbnailer.of(file));
      inference = activity ? aiInferenceClient.infer(file) : null;
      saved =
          mediaService.create(
              upload.mediaId(),
              me,
              upload.purpose(),
              objectKey,
              thumbKey,
              activity ? photo(upload, inference, received) : null);
    } catch (RuntimeException e) {
      deleteFiles(objectKey, thumbKey);
      throw e;
    }
    if (!saved.media().objectKey().equals(objectKey)) {
      // 같은 사람의 동시 재전송이 먼저 행을 만들었다. 이 시도의 파일은 어디서도 가리키지 않는다
      deleteFiles(objectKey, thumbKey);
    }
    return response(saved.media(), saved.photoId(), inference);
  }

  private NewActivityPhoto photo(
      MediaUpload upload, InferenceResponse inference, Instant received) {
    Instant takenAt = upload.takenAt() == null ? received : upload.takenAt();
    return new NewActivityPhoto(
        upload.activityId(),
        upload.mediaId(),
        takenAt,
        upload.lat(),
        upload.lng(),
        inference.status(),
        inference.modelVersion(),
        inference.inferenceMs());
  }

  private void deleteFiles(String... keys) {
    for (String key : List.of(keys)) {
      try {
        storage.delete(key);
      } catch (RuntimeException e) {
        log.error("사진 파일을 지우지 못했다 — 디스크에 남아 있다: {}", key, e);
      }
    }
  }

  private String key(UUID mediaId, String attempt, String suffix) {
    String folder = LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC).format(monthFolder);
    return folder + "/" + mediaId + "-" + attempt + suffix + EXTENSION;
  }

  private MediaUploadResponse response(
      MediaSummary media, UUID photoId, InferenceResponse inference) {
    return new MediaUploadResponse(
        media.id().toString(),
        photoId == null ? null : photoId.toString(),
        signedUrl.of(media.objectKey()),
        signedUrl.of(media.thumbKey()),
        inference);
  }
}
