package site.gachijoopging.server.domain.safety.service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;
import site.gachijoopging.server.domain.media.service.MediaSignedUrl;
import site.gachijoopging.server.domain.notice.service.NoticeService;
import site.gachijoopging.server.domain.post.service.PostService;
import site.gachijoopging.server.domain.safety.dto.CreateReportRequest;
import site.gachijoopging.server.domain.safety.dto.ReportResponse;
import site.gachijoopging.server.domain.safety.entity.Report;
import site.gachijoopging.server.domain.safety.entity.ReportReason;
import site.gachijoopging.server.domain.safety.entity.ReportResult;
import site.gachijoopging.server.domain.safety.entity.ReportTargetType;
import site.gachijoopging.server.domain.safety.event.ReportCreatedEvent;
import site.gachijoopging.server.domain.safety.event.ReportResolvedEvent;
import site.gachijoopging.server.domain.safety.repository.ReportQueryRepository;
import site.gachijoopging.server.domain.safety.repository.ReportQueryRepository.PendingRow;
import site.gachijoopging.server.domain.safety.repository.ReportRepository;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.lock.UserLock;
import site.gachijoopging.server.global.response.CursorPage;
import site.gachijoopging.server.global.response.Cursors;
import site.gachijoopging.server.global.security.CrewMembership;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ReportService {

  private static final int MAX_MEMO = 500;

  private static final int PREVIEW = 100;

  private static final String WITHDRAWN_NICKNAME = "탈퇴한 크루원";

  private final ReportRepository reportRepository;
  private final ReportQueryRepository queryRepository;
  private final PostService postService;
  private final NoticeService noticeService;
  private final MediaSignedUrl signedUrl;
  private final ApplicationEventPublisher events;
  private final UserLock userLock;
  private final Clock clock;

  /** false 면 같은 id 재전송을 흡수한 것이다. */
  @Transactional
  public boolean create(UUID me, CrewMembership crew, CreateReportRequest request) {
    userLock.lock(me);
    // 신고는 크루장이 처리하므로 크루장은 내지 않는다 (feature-scope 권한표).
    // 추방과 같은 순서(크루 행 → 소속 행)로 잡아야 신고자 추방과 엇갈려 교착하지 않는다
    if (queryRepository.lockLeader(crew.crewId(), me)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "크루장은 신고하지 않고 처리한다");
    }
    // 주입된 소속은 잠금을 기다리기 전에 읽은 것이라, 그사이 나갔거나 추방됐으면 옛 크루에 신고하게 된다
    if (!queryRepository.lockMembership(crew.crewId(), me)) {
      throw new BusinessException(ErrorCode.NO_CREW, "소속 크루가 없다");
    }
    Report same = reportRepository.findById(request.id()).orElse(null);
    if (same != null) {
      if (!same.reportedBy(me)) {
        throw new BusinessException(ErrorCode.FORBIDDEN, "남의 신고 id 다");
      }
      return false;
    }
    String memo = memo(request);
    UUID target = targetId(request.targetId());
    if (request.targetType() == ReportTargetType.USER && target.equals(me)) {
      throw invalid("자기 자신은 신고할 수 없다");
    }
    if (!queryRepository.lockTarget(request.targetType(), target, crew.crewId(), me)) {
      throw new BusinessException(ErrorCode.NOT_FOUND, "신고할 대상이 없다");
    }

    // 대상 id 를 UUID 표준 문자열로 맞춰 넣어야 대소문자만 다른 같은 대상이 중복 검사를 피하지 못한다
    if (reportRepository.insertIfAbsent(
            request.id(),
            crew.crewId(),
            me,
            request.targetType().name(),
            target.toString(),
            request.reason().name(),
            memo,
            clock.instant())
        == 0) {
      if (reportRepository.existsById(request.id())) {
        throw new BusinessException(ErrorCode.FORBIDDEN, "남의 신고 id 다");
      }
      throw new BusinessException(ErrorCode.CONFLICT, "이미 신고한 대상이다");
    }
    events.publishEvent(new ReportCreatedEvent(crew.crewId(), request.id(), me));
    return true;
  }

  public CursorPage<ReportResponse> pending(CrewMembership crew, String cursor, int limit) {
    crew.requireLeader();
    Cursors.Cursor after = cursor == null ? null : Cursors.decode(cursor);
    List<PendingRow> rows =
        queryRepository.findPending(
            crew.crewId(),
            after == null ? null : after.createdAt(),
            after == null ? null : after.id(),
            limit + 1);
    List<PendingRow> page = rows.subList(0, Math.min(limit, rows.size()));
    String next =
        rows.size() > limit
            ? Cursors.encode(page.getLast().createdAt(), page.getLast().id())
            : null;
    return new CursorPage<>(page.stream().map(this::response).toList(), next);
  }

  @Transactional
  public void process(UUID me, CrewMembership crew, UUID reportId, ReportResult result) {
    // 주입된 크루장 여부는 요청 시작 때 것이라, 그사이 위임이 커밋됐으면 옛 권한으로 처리하게 된다
    if (!queryRepository.lockLeader(crew.crewId(), me)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "크루장만 할 수 있다");
    }
    // 다른 기기의 처리나 추방이 같은 신고를 함께 닫지 않게 행을 잡은 뒤 상태를 본다
    Report report =
        reportRepository
            .findForUpdate(reportId)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "없는 신고다"));
    if (!report.getCrewId().equals(crew.crewId())) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "다른 크루의 신고다");
    }
    if (report.resolved()) {
      throw new BusinessException(ErrorCode.CONFLICT, "이미 처리된 신고다");
    }
    if (result == ReportResult.DELETE) {
      deleteTarget(me, report);
    }
    report.resolve(result, me, clock.instant());
    events.publishEvent(new ReportResolvedEvent(report.getId(), report.getReporterId(), result));
  }

  // 추방과 한 트랜잭션이어야 추방만 커밋되고 신고가 대기로 남는 일이 없다
  @Transactional(propagation = Propagation.MANDATORY)
  public void resolveExpelled(UUID leaderId, UUID crewId, UUID userId) {
    Instant now = clock.instant();
    for (Report report :
        reportRepository.findPendingUserReportsForUpdate(crewId, userId.toString())) {
      report.resolve(null, leaderId, now);
      events.publishEvent(new ReportResolvedEvent(report.getId(), report.getReporterId(), null));
    }
  }

  // 422 로 거절한다 — 6-2 는 404·409 를 "이미 처리됨" 으로 읽고 행을 지운다
  private void deleteTarget(UUID me, Report report) {
    UUID target = UUID.fromString(report.getTargetId());
    switch (report.getTargetType()) {
      case POST -> postService.deleteReported(me, report.getCrewId(), target);
      case COMMENT -> postService.deleteReportedComment(me, report.getCrewId(), target);
      case NOTICE_COMMENT -> noticeService.deleteReportedComment(me, report.getCrewId(), target);
      case USER -> throw invalid("사용자 신고는 지울 수 없다 — 기각하거나 추방한다");
      case CHAT_MESSAGE -> throw invalid("채팅 메시지 삭제는 아직 없다");
    }
  }

  private static String memo(CreateReportRequest request) {
    String memo = request.memo() == null ? "" : request.memo().strip();
    if (memo.codePointCount(0, memo.length()) > MAX_MEMO) {
      throw invalid("메모는 " + MAX_MEMO + "자까지다");
    }
    if (memo.isEmpty()) {
      if (request.reason() == ReportReason.OTHER) {
        throw invalid("기타 사유는 메모가 있어야 한다");
      }
      return null;
    }
    return memo;
  }

  private static UUID targetId(String value) {
    try {
      return UUID.fromString(value);
    } catch (IllegalArgumentException e) {
      throw new BusinessException(ErrorCode.NOT_FOUND, "신고할 대상이 없다");
    }
  }

  private ReportResponse response(PendingRow row) {
    return new ReportResponse(
        row.id().toString(),
        reporter(row),
        row.targetType(),
        row.targetId(),
        row.targetWithdrawn()
            ? WITHDRAWN_NICKNAME
            : preview(Objects.requireNonNullElse(row.targetText(), "")),
        row.reason(),
        row.memo(),
        row.createdAt());
  }

  // 탈퇴한 사람은 이름·사진 없이 "탈퇴한 크루원" 으로 보인다 (ERD 회원 탈퇴 때)
  private UserBriefResponse reporter(PendingRow row) {
    if ("DELETED".equals(row.status())) {
      return new UserBriefResponse(row.reporterId().toString(), WITHDRAWN_NICKNAME, null, true);
    }
    return new UserBriefResponse(
        row.reporterId().toString(),
        Objects.requireNonNullElse(row.nickname(), ""),
        row.photoKey() == null ? null : signedUrl.of(row.photoKey()),
        false);
  }

  // 코드포인트로 잘라야 이모지가 반으로 갈리지 않는다
  private static String preview(String text) {
    String line = text.replaceAll("\\r\\n|\\r|\\n", " ");
    return line.substring(
        0, line.offsetByCodePoints(0, Math.min(PREVIEW, line.codePointCount(0, line.length()))));
  }

  private static BusinessException invalid(String message) {
    return new BusinessException(ErrorCode.VALIDATION, message);
  }
}
