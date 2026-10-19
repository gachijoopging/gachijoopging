package site.gachijoopging.server.domain.media.dto;

import java.time.Instant;
import java.util.UUID;
import site.gachijoopging.server.domain.media.entity.MediaPurpose;

public record MediaUpload(
    UUID mediaId,
    byte[] file,
    MediaPurpose purpose,
    UUID activityId,
    Instant takenAt,
    Double lat,
    Double lng) {}
