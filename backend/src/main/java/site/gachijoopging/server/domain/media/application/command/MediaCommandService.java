package site.gachijoopging.server.domain.media.application.command;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import site.gachijoopging.server.domain.media.domain.policy.MediaImageValidator;
import site.gachijoopging.server.domain.media.domain.policy.MediaSignedUrl;
import site.gachijoopging.server.domain.media.domain.service.MediaService;
import site.gachijoopging.server.domain.media.dto.MediaDtos.InferenceResponse;
import site.gachijoopging.server.domain.media.dto.MediaDtos.MediaUploadResponse;
import site.gachijoopging.server.domain.media.dto.MediaSummary;
import site.gachijoopging.server.domain.media.infrastructure.client.AiInferenceClient;
import site.gachijoopging.server.domain.media.infrastructure.client.MediaStorage;
import site.gachijoopging.server.domain.media.infrastructure.client.Thumbnailer;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

@Service
@RequiredArgsConstructor
public class MediaCommandService {

  private static final DateTimeFormatter monthFolder = DateTimeFormatter.ofPattern("yyyy/MM");
  private static final String EXTENSION = ".jpg";
  private static final String THUMBNAIL_SUFFIX = "_thumb";

  private final MediaService mediaService;
  private final MediaImageValidator validator;
  private final MediaStorage storage;
  private final Thumbnailer thumbnailer;
  private final MediaSignedUrl signedUrl;
  private final AiInferenceClient aiInferenceClient;
  private final Clock clock;

  public MediaUploadResponse upload(UUID me, UUID mediaId, byte[] file) {
    validator.validate(file);

    Optional<MediaSummary> existing = mediaService.find(mediaId);
    if (existing.isPresent()) {
      return resend(me, file, existing.get());
    }
    return fresh(me, mediaId, file);
  }

  private MediaUploadResponse resend(UUID me, byte[] file, MediaSummary media) {
    if (!media.ownerId().equals(me)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "남의 mediaId 다");
    }
    return response(media, aiInferenceClient.infer(file));
  }

  private MediaUploadResponse fresh(UUID me, UUID mediaId, byte[] file) {
    mediaService.checkDailyQuota(me);

    String objectKey = key(mediaId, "");
    String thumbKey = key(mediaId, THUMBNAIL_SUFFIX);
    storage.store(objectKey, file);
    storage.store(thumbKey, thumbnailer.of(file));

    InferenceResponse inference = aiInferenceClient.infer(file);

    return response(mediaService.create(mediaId, me, objectKey, thumbKey), inference);
  }

  private String key(UUID mediaId, String suffix) {
    String folder = LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC).format(monthFolder);
    return folder + "/" + mediaId + suffix + EXTENSION;
  }

  private MediaUploadResponse response(MediaSummary media, InferenceResponse inference) {
    return new MediaUploadResponse(
        media.id().toString(),
        signedUrl.of(media.objectKey()),
        signedUrl.of(media.thumbKey()),
        inference);
  }
}
