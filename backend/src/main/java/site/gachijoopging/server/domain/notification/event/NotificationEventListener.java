package site.gachijoopging.server.domain.notification.event;

import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.crew.event.CrewJoinedEvent;
import site.gachijoopging.server.domain.crew.event.JoinRequestDecidedEvent;
import site.gachijoopging.server.domain.crew.event.JoinRequestedEvent;
import site.gachijoopging.server.domain.live.event.LiveStartedEvent;
import site.gachijoopging.server.domain.notice.event.NoticeCreatedEvent;
import site.gachijoopging.server.domain.notification.service.NotificationService;
import site.gachijoopging.server.domain.post.event.CommentCreatedEvent;
import site.gachijoopging.server.domain.post.event.PostRemovedEvent;
import site.gachijoopging.server.domain.safety.event.ReportCreatedEvent;
import site.gachijoopging.server.domain.safety.event.ReportResolvedEvent;

// 커밋 뒤가 아니라 발행한 트랜잭션 안에서 받는다 — 알림 행이 그 일과 함께 커밋·롤백돼야 한다 (02-conventions §10-나).
// 발행하는 도메인이 notification 서비스를 주입하지 않아도 되므로 의존이 한 방향으로 남는다
@Component
@RequiredArgsConstructor
public class NotificationEventListener {

  private final NotificationService notificationService;

  @EventListener
  public void onJoinRequested(JoinRequestedEvent event) {
    notificationService.joinRequested(event.leaderId(), event.applicantId(), event.requestId());
  }

  @EventListener
  public void onCrewJoined(CrewJoinedEvent event) {
    notificationService.crewJoined(event.leaderId(), event.memberId());
  }

  @EventListener
  public void onJoinRequestDecided(JoinRequestDecidedEvent event) {
    notificationService.joinDecided(event.applicantId(), event.crewId(), event.approved());
  }

  @EventListener
  public void onNoticeCreated(NoticeCreatedEvent event) {
    notificationService.noticeCreated(event.noticeId(), event.authorId());
  }

  @EventListener
  public void onCommentCreated(CommentCreatedEvent event) {
    notificationService.commentCreated(event.postId(), event.postAuthorId(), event.commentId());
  }

  @EventListener
  public void onLiveStarted(LiveStartedEvent event) {
    notificationService.activityStarted(event.crewId(), event.userId(), event.activityId());
  }

  @EventListener
  public void onReportCreated(ReportCreatedEvent event) {
    notificationService.reportCreated(event.reportId());
  }

  @EventListener
  public void onReportResolved(ReportResolvedEvent event) {
    notificationService.reportResolved(event.reporterId(), event.result());
  }

  @EventListener
  public void onPostRemoved(PostRemovedEvent event) {
    notificationService.postRemoved(event.postId());
  }
}
