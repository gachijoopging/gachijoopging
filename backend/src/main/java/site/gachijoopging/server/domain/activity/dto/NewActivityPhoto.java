package site.gachijoopging.server.domain.activity.dto;

import java.time.Instant;
import java.util.UUID;

public record NewActivityPhoto(
    UUID activityId,
    UUID mediaId,
    Instant takenAt,
    Double lat,
    Double lng,
    boolean inferenceOk,
    String modelVersion,
    Integer inferenceMs) {}
