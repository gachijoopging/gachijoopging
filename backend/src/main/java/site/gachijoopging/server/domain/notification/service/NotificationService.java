package site.gachijoopging.server.domain.notification.service;

import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.notification.dto.NotificationResponse;
import site.gachijoopging.server.domain.notification.dto.NotificationsResponse;
import site.gachijoopging.server.domain.notification.dto.ReadNotificationsRequest;
import site.gachijoopging.server.domain.notification.entity.NotificationTargetType;
import site.gachijoopging.server.domain.notification.entity.NotificationType;
import site.gachijoopging.server.domain.notification.event.NotificationCreatedEvent;
import site.gachijoopging.server.domain.notification.repository.NotificationRepository;
import site.gachijoopging.server.domain.notification.repository.NotificationRepository.NotificationRow;
import site.gachijoopging.server.domain.safety.entity.ReportResult;
import site.gachijoopging.server.global.response.Cursors;
import site.gachijoopging.server.global.security.CrewMembership;

// 알림 행은 그 일을 저장하는 트랜잭션 안에서 만들고, 푸시·소켓은 커밋 뒤에 보낸다 (02-conventions §10-나)
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class NotificationService {

  private final NotificationRepository repository;
  private final ApplicationEventPublisher events;
  private final Clock clock;

  public NotificationsResponse list(UUID me, CrewMembership crew, String cursor, int limit) {
    Cursors.LongCursor before = cursor == null ? null : Cursors.decodeLong(cursor);
    List<NotificationRow> rows =
        repository.findPage(
            me,
            before == null ? null : before.createdAt(),
            before == null ? null : before.id(),
            limit + 1);
    List<NotificationRow> page = rows.subList(0, Math.min(limit, rows.size()));
    String next =
        rows.size() > limit
            ? Cursors.encode(page.getLast().createdAt(), page.getLast().id())
            : null;
    NotificationsResponse.Pending pending =
        crew.leader()
            ? new NotificationsResponse.Pending(
                repository.countPendingJoinRequests(crew.crewId()),
                repository.countPendingReports(crew.crewId()))
            : new NotificationsResponse.Pending(0, 0);
    return new NotificationsResponse(
        pending, page.stream().map(NotificationService::response).toList(), next);
  }

  @Transactional
  public void read(UUID me, ReadNotificationsRequest request) {
    List<Long> ids = request == null ? null : request.ids();
    if (ids == null) {
      repository.markAllRead(me);
    } else if (!ids.isEmpty()) {
      repository.markRead(me, ids);
    }
  }

  public long unreadCount(UUID me) {
    return repository.countUnread(me);
  }

  public Map<UUID, List<String>> pushTokens(List<UUID> userIds) {
    return repository.findPushTokens(userIds);
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void joinRequested(UUID leaderId, UUID applicantId, UUID requestId) {
    created(repository.insertJoinRequest(leaderId, applicantId, requestId, clock.instant()));
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void crewJoined(UUID leaderId, UUID memberId) {
    created(repository.insertCrewJoined(leaderId, memberId, clock.instant()));
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void joinDecided(UUID applicantId, UUID crewId, boolean approved) {
    created(repository.insertJoinDecided(applicantId, crewId, approved, clock.instant()));
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void noticeCreated(UUID noticeId, UUID authorId) {
    created(repository.insertNotice(noticeId, authorId, clock.instant()));
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void commentCreated(UUID postId, UUID postAuthorId, UUID commentId) {
    created(repository.insertComment(postId, postAuthorId, commentId, clock.instant()));
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void activityStarted(UUID crewId, UUID userId, UUID activityId) {
    created(repository.insertActivityStarted(crewId, userId, activityId, clock.instant()));
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void reportCreated(UUID reportId) {
    created(repository.insertReport(reportId, clock.instant()));
  }

  // 결과는 글로만 알린다 — 신고자를 크루장 전용 처리 화면으로 보내지 않는다 (ERD reports)
  @Transactional(propagation = Propagation.MANDATORY)
  public void reportResolved(UUID reporterId, ReportResult result) {
    String detail =
        result == null
            ? "신고한 크루원을 크루에서 내보냈어요"
            : switch (result) {
              case DELETE -> "신고한 내용을 삭제했어요";
              case DISMISS -> "신고한 내용을 검토했지만 조치하지 않았어요";
            };
    created(repository.insertReportResolved(reporterId, detail, clock.instant()));
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void postRemoved(UUID postId) {
    created(repository.insertPostRemoved(postId, clock.instant()));
  }

  private void created(List<NotificationRow> rows) {
    if (rows.isEmpty()) {
      return;
    }
    events.publishEvent(
        new NotificationCreatedEvent(
            rows.stream()
                .map(row -> new NotificationCreatedEvent.Recipient(row.userId(), response(row)))
                .toList()));
  }

  private static NotificationResponse response(NotificationRow row) {
    return new NotificationResponse(
        row.id(),
        NotificationType.valueOf(row.type()),
        row.title(),
        row.detail(),
        row.unread(),
        new NotificationResponse.Target(
            NotificationTargetType.valueOf(row.targetType()), row.targetId()),
        row.createdAt());
  }
}
