package site.gachijoopging.server.domain.media.dto;

import java.util.UUID;
import site.gachijoopging.server.domain.media.entity.Media;
import site.gachijoopging.server.domain.media.entity.MediaPurpose;

public record MediaSummary(
    UUID id, UUID ownerId, MediaPurpose purpose, String objectKey, String thumbKey) {

  public static MediaSummary from(Media media) {
    return new MediaSummary(
        media.getId(),
        media.getOwnerId(),
        media.getPurpose(),
        media.getObjectKey(),
        media.getThumbKey());
  }
}
