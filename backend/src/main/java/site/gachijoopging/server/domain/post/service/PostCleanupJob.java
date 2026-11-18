package site.gachijoopging.server.domain.post.service;

import java.time.Clock;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.media.event.MediaReleaseEvent;
import site.gachijoopging.server.domain.post.repository.CommentRepository;
import site.gachijoopging.server.domain.post.repository.PostRepository;
import site.gachijoopging.server.global.batch.BatchDelete;
import site.gachijoopging.server.global.batch.RetentionProperties;

@Slf4j
@Component
@RequiredArgsConstructor
public class PostCleanupJob {

  private final PostRepository postRepository;
  private final CommentRepository commentRepository;
  private final ApplicationEventPublisher events;
  private final BatchDelete batchDelete;
  private final Clock clock;
  private final RetentionProperties retention;

  @Scheduled(cron = "0 0 4 * * *", zone = "Asia/Seoul")
  public int removeDeletedPosts() {
    var threshold = clock.instant().minus(retention.softDeleted());
    int posts =
        batchDelete.untilDone(
            n -> {
              List<UUID> ids = postRepository.findDeletedBefore(threshold, n);
              if (ids.isEmpty()) {
                return 0;
              }
              List<UUID> mediaIds = postRepository.findMediaIds(ids);
              postRepository.purge(ids);
              events.publishEvent(new MediaReleaseEvent(mediaIds));
              return ids.size();
            });
    int comments = batchDelete.untilDone(n -> commentRepository.deleteDeletedBefore(threshold, n));
    if (posts + comments > 0) {
      log.info("지운 지 30일 된 게시물 {}행 · 댓글 {}행 정리", posts, comments);
    }
    return posts + comments;
  }
}
