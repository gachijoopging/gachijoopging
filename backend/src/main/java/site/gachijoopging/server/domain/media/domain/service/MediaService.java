package site.gachijoopging.server.domain.media.domain.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.media.domain.entity.Media;
import site.gachijoopging.server.domain.media.dto.MediaSummary;
import site.gachijoopging.server.domain.media.infrastructure.persistence.MediaRepository;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MediaService {

  private static final int DAILY_LIMIT = 300;

  private static final ZoneId KST = ZoneId.of("Asia/Seoul");

  private final MediaRepository mediaRepository;
  private final Clock clock;

  public Optional<MediaSummary> find(UUID mediaId) {
    return mediaRepository.findById(mediaId).map(MediaSummary::from);
  }

  public void requireOwnedBy(UUID mediaId, UUID ownerId) {
    if (!mediaRepository.existsByIdAndOwnerId(mediaId, ownerId)) {
      throw new BusinessException(ErrorCode.VALIDATION, "쓸 수 없는 mediaId 다: " + mediaId);
    }
  }

  public void checkDailyQuota(UUID ownerId) {
    Instant now = clock.instant();
    long todayUploadCount =
        mediaRepository.countByOwnerIdAndCreatedAtGreaterThanEqual(ownerId, kstMidnight(now));
    if (todayUploadCount >= DAILY_LIMIT) {
      throw new BusinessException(
          ErrorCode.RATE_LIMITED, "오늘 올릴 수 있는 사진을 다 썼다", secondsUntilMidnight(now));
    }
  }

  @Transactional
  public MediaSummary create(UUID mediaId, UUID ownerId, String objectKey, String thumbKey) {
    return MediaSummary.from(
        mediaRepository
            .findById(mediaId)
            .orElseGet(
                () ->
                    mediaRepository.save(
                        Media.builder()
                            .id(mediaId)
                            .ownerId(ownerId)
                            .objectKey(objectKey)
                            .thumbKey(thumbKey)
                            .createdAt(clock.instant())
                            .build())));
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void quarantine(String fromKey, String toKey) {
    mediaRepository.quarantineObjectKey(fromKey, toKey);
    mediaRepository.quarantineThumbKey(fromKey, toKey);
  }

  private static Instant kstMidnight(Instant now) {
    return LocalDate.ofInstant(now, KST).atStartOfDay(KST).toInstant();
  }

  private static long secondsUntilMidnight(Instant now) {
    Instant nextMidnight = LocalDate.ofInstant(now, KST).plusDays(1).atStartOfDay(KST).toInstant();
    return Duration.between(now, nextMidnight).toSeconds();
  }
}
