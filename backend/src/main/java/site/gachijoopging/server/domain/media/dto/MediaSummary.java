package site.gachijoopging.server.domain.media.dto;

import java.util.UUID;
import site.gachijoopging.server.domain.media.domain.entity.Media;

public record MediaSummary(UUID id, UUID ownerId, String objectKey, String thumbKey) {

  public static MediaSummary from(Media media) {
    return new MediaSummary(
        media.getId(), media.getOwnerId(), media.getObjectKey(), media.getThumbKey());
  }
}
