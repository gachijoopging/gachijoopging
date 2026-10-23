package site.gachijoopging.server.domain.media.service;

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
import site.gachijoopging.server.domain.activity.dto.NewActivityPhoto;
import site.gachijoopging.server.domain.activity.service.ActivityService;
import site.gachijoopging.server.domain.media.dto.MediaSummary;
import site.gachijoopging.server.domain.media.dto.MediaUpload;
import site.gachijoopging.server.domain.media.entity.Media;
import site.gachijoopging.server.domain.media.entity.MediaPurpose;
import site.gachijoopging.server.domain.media.repository.MediaRepository;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.ratelimit.RateLimiter;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MediaService {

  private static final int DAILY_LIMIT = 300;

  private static final ZoneId KST = ZoneId.of("Asia/Seoul");

  private final MediaRepository mediaRepository;
  private final ActivityService activityService;
  private final RateLimiter rateLimiter;
  private final Clock clock;

  public Optional<MediaSummary> find(UUID mediaId) {
    return mediaRepository.findById(mediaId).map(MediaSummary::from);
  }

  public void requireOwnedBy(UUID mediaId, UUID ownerId) {
    if (!mediaRepository.existsByIdAndOwnerId(mediaId, ownerId)) {
      throw new BusinessException(ErrorCode.VALIDATION, "쓸 수 없는 mediaId 다: " + mediaId);
    }
  }

  // 남은 media 행을 세면 올리고 지우기를 되풀이해 추론·디스크 상한을 피할 수 있어, 지워도 줄지 않는 시도 수를 센다
  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public void checkDailyQuota(UUID ownerId) {
    Instant now = clock.instant();
    LocalDate today = LocalDate.ofInstant(now, KST);
    Duration untilMidnight = Duration.ofSeconds(secondsUntilMidnight(now));
    if (!rateLimiter.tryAcquire(
        "media:daily:" + ownerId + ":" + today, DAILY_LIMIT, untilMidnight)) {
      throw new BusinessException(
          ErrorCode.RATE_LIMITED, "오늘 올릴 수 있는 사진을 다 썼다", secondsUntilMidnight(now));
    }
  }

  public record Saved(MediaSummary media, UUID photoId) {}

  public static void requireShape(MediaUpload upload) {
    if (upload.purpose() == MediaPurpose.ACTIVITY && upload.activityId() == null) {
      throw new BusinessException(ErrorCode.VALIDATION, "활동 사진에는 activityId 가 필요하다");
    }
    if ((upload.lat() == null) != (upload.lng() == null)) {
      throw new BusinessException(ErrorCode.VALIDATION, "lat·lng 는 함께 보낸다");
    }
    // NaN 은 어떤 비교도 거짓이라, 범위 안에 있는지를 물어야 NaN 도 걸러진다
    if (upload.lat() != null && !(Math.abs(upload.lat()) <= 90 && Math.abs(upload.lng()) <= 180)) {
      throw new BusinessException(ErrorCode.VALIDATION, "lat·lng 가 범위를 벗어났다");
    }
  }

  // 활동 사진이면 activity_photos 행을 같은 트랜잭션에서 만든다. 활동이 그사이 끝나 실패하면
  // media 행도 함께 사라져, 어디에도 붙지 않은 사진이 남지 않는다
  @Transactional
  public Saved create(
      UUID mediaId,
      UUID ownerId,
      MediaPurpose purpose,
      String objectKey,
      String thumbKey,
      NewActivityPhoto photo) {
    mediaRepository.insertIfAbsent(
        mediaId, ownerId, purpose.name(), objectKey, thumbKey, clock.instant());
    Media media =
        mediaRepository
            .findById(mediaId)
            .orElseThrow(() -> new BusinessException(ErrorCode.INTERNAL, "넣은 사진이 없다"));
    if (!media.getOwnerId().equals(ownerId)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "남의 mediaId 다");
    }
    requireSamePurpose(media.getPurpose(), purpose);
    UUID photoId = photo == null ? null : activityService.addPhoto(ownerId, photo);
    return new Saved(MediaSummary.from(media), photoId);
  }

  public static void requireSamePurpose(MediaPurpose saved, MediaPurpose requested) {
    if (saved != requested) {
      throw new BusinessException(ErrorCode.CONFLICT, "다른 용도로 이미 올린 사진이다: " + saved);
    }
  }

  /** 지운 사진의 키를 돌려준다. 파일은 커밋 뒤에 지워야 해서 부른 쪽이 지운다. 없으면 빈 값이다. */
  @Transactional
  public Optional<MediaSummary> delete(UUID me, UUID mediaId) {
    Media media = mediaRepository.findForUpdate(mediaId).orElse(null);
    if (media == null) {
      return Optional.empty();
    }
    if (!media.getOwnerId().equals(me)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "남의 사진이다");
    }
    if (mediaRepository.isUsedOutsideActivities(mediaId)) {
      throw new BusinessException(ErrorCode.CONFLICT, "프로필·크루·게시물에 쓰인 사진이다");
    }
    activityService.removePhoto(me, mediaId);
    mediaRepository.delete(media);
    return Optional.of(MediaSummary.from(media));
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void quarantine(String fromKey, String toKey) {
    mediaRepository.quarantineObjectKey(fromKey, toKey);
    mediaRepository.quarantineThumbKey(fromKey, toKey);
  }

  private static long secondsUntilMidnight(Instant now) {
    Instant nextMidnight = LocalDate.ofInstant(now, KST).plusDays(1).atStartOfDay(KST).toInstant();
    return Duration.between(now, nextMidnight).toSeconds();
  }
}
