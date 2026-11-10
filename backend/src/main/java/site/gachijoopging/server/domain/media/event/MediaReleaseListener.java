package site.gachijoopging.server.domain.media.event;

import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.media.service.MediaService;

// 콘텐츠를 지우는 트랜잭션 안에서 사진 행도 지워야, 한쪽만 커밋돼 주인 없는 사진이 남지 않는다.
// activity 는 MediaService 를 주입하면 media → activity 와 순환해 이벤트로 받는다
@Component
@RequiredArgsConstructor
public class MediaReleaseListener {

  private final MediaService mediaService;

  @EventListener
  public void onMediaReleased(MediaReleasedEvent event) {
    mediaService.release(event.mediaIds());
  }
}
