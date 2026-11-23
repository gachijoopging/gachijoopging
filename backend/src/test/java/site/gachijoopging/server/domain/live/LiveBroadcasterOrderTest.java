package site.gachijoopging.server.domain.live;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import site.gachijoopging.server.domain.live.dto.LiveMemberResponse;
import site.gachijoopging.server.domain.live.dto.LiveUpdateResponse;
import site.gachijoopging.server.domain.live.repository.LiveLocationRepository;
import site.gachijoopging.server.domain.live.service.LiveBroadcaster;
import site.gachijoopging.server.domain.live.service.LiveService;
import site.gachijoopging.server.global.websocket.SocketMessage;

class LiveBroadcasterOrderTest {

  @Test
  void 시작_조회_중에_종료가_오면_LIVE_ENDED_가_LIVE_STARTED_뒤에_나간다() throws Exception {
    UUID 크루 = UUID.randomUUID();
    UUID 사용자 = UUID.randomUUID();
    UUID 받는_사람 = UUID.randomUUID();
    UUID 활동 = UUID.randomUUID();
    LiveLocationRepository repository = mock(LiveLocationRepository.class);
    SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
    LiveService liveService = mock(LiveService.class);
    when(repository.findRecipients(크루, 사용자)).thenReturn(List.of(받는_사람));
    CountDownLatch 조회_중 = new CountDownLatch(1);
    CountDownLatch 조회_끝 = new CountDownLatch(1);
    when(liveService.member(사용자, 활동, 크루))
        .thenAnswer(
            inv -> {
              조회_중.countDown();
              조회_끝.await(5, TimeUnit.SECONDS);
              return Optional.of(mock(LiveMemberResponse.class));
            });
    LiveBroadcaster broadcaster = new LiveBroadcaster(repository, messaging, liveService);

    CompletableFuture<Void> 시작 = CompletableFuture.runAsync(() -> broadcaster.started(크루, 사용자, 활동));
    조회_중.await(5, TimeUnit.SECONDS);
    Thread 종료 = new Thread(() -> broadcaster.ended(크루, 사용자, 활동));
    종료.start();
    Awaitility.await()
        .atMost(Duration.ofSeconds(5))
        .until(() -> 종료.getState() == Thread.State.BLOCKED);
    조회_끝.countDown();
    시작.get(5, TimeUnit.SECONDS);
    종료.join(5000);

    InOrder 순서 = inOrder(messaging);
    순서.verify(messaging).convertAndSendToUser(eq(받는_사람.toString()), any(), 종류("LIVE_STARTED"));
    순서.verify(messaging).convertAndSendToUser(eq(받는_사람.toString()), any(), 종류("LIVE_ENDED"));
  }

  @Test
  void 이전_활동의_늦은_종료는_새_활동의_묶인_갱신을_지우지_않는다() {
    UUID 크루 = UUID.randomUUID();
    UUID 사용자 = UUID.randomUUID();
    UUID 받는_사람 = UUID.randomUUID();
    UUID 이전_활동 = UUID.randomUUID();
    UUID 새_활동 = UUID.randomUUID();
    LiveLocationRepository repository = mock(LiveLocationRepository.class);
    SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
    when(repository.findRecipients(크루, 사용자)).thenReturn(List.of(받는_사람));
    when(repository.exists(사용자, 새_활동)).thenReturn(true);
    LiveBroadcaster broadcaster =
        new LiveBroadcaster(repository, messaging, mock(LiveService.class));

    broadcaster.update(크루, 사용자, 새_활동, mock(LiveUpdateResponse.class));
    broadcaster.ended(크루, 사용자, 이전_활동);
    broadcaster.flush();

    InOrder 순서 = inOrder(messaging);
    순서.verify(messaging).convertAndSendToUser(eq(받는_사람.toString()), any(), 종류("LIVE_ENDED"));
    순서.verify(messaging).convertAndSendToUser(eq(받는_사람.toString()), any(), 종류("LIVE_UPDATE"));
  }

  private static Object 종류(String type) {
    return argThat(m -> m instanceof SocketMessage s && s.type().equals(type));
  }
}
