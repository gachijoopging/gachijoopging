package site.gachijoopging.server.domain.notice.service;

import java.time.Clock;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;
import site.gachijoopging.server.domain.media.service.MediaSignedUrl;
import site.gachijoopging.server.domain.notice.dto.CreateNoticeRequest;
import site.gachijoopging.server.domain.notice.dto.LatestNotice;
import site.gachijoopging.server.domain.notice.dto.NoticeDetailResponse;
import site.gachijoopging.server.domain.notice.dto.NoticeResponse;
import site.gachijoopging.server.domain.notice.dto.UpdateNoticeRequest;
import site.gachijoopging.server.domain.notice.entity.Notice;
import site.gachijoopging.server.domain.notice.entity.NoticeComment;
import site.gachijoopging.server.domain.notice.event.NoticeCreatedEvent;
import site.gachijoopging.server.domain.notice.repository.NoticeCommentRepository;
import site.gachijoopging.server.domain.notice.repository.NoticeQueryRepository;
import site.gachijoopging.server.domain.notice.repository.NoticeQueryRepository.CommentRow;
import site.gachijoopging.server.domain.notice.repository.NoticeQueryRepository.NoticeRow;
import site.gachijoopging.server.domain.notice.repository.NoticeRepository;
import site.gachijoopging.server.domain.post.dto.CommentResponse;
import site.gachijoopging.server.domain.post.dto.CreateCommentRequest;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.lock.UserLock;
import site.gachijoopging.server.global.response.CursorPage;
import site.gachijoopging.server.global.response.Cursors;
import site.gachijoopging.server.global.security.CrewMembership;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class NoticeService {

  private static final int MAX_TITLE = 100;

  private static final int MAX_BODY = 3000;

  private static final int MAX_COMMENT = 500;

  private static final int PREVIEW = 100;

  private static final String WITHDRAWN_NICKNAME = "탈퇴한 크루원";

  private final NoticeRepository noticeRepository;
  private final NoticeCommentRepository commentRepository;
  private final NoticeQueryRepository queryRepository;
  private final MediaSignedUrl signedUrl;
  private final ApplicationEventPublisher events;
  private final UserLock userLock;
  private final Clock clock;

  public record Created(boolean created, NoticeResponse notice) {}

  public CursorPage<NoticeResponse> list(UUID me, CrewMembership crew, String cursor, int limit) {
    Cursors.Cursor before = cursor == null ? null : Cursors.decode(cursor);
    List<NoticeRow> rows =
        queryRepository.findPage(
            me,
            crew.crewId(),
            before == null ? null : before.createdAt(),
            before == null ? null : before.id(),
            limit + 1);
    List<NoticeRow> page = rows.subList(0, Math.min(limit, rows.size()));
    String next =
        rows.size() > limit
            ? Cursors.encode(page.getLast().createdAt(), page.getLast().id())
            : null;
    return new CursorPage<>(page.stream().map(NoticeService::response).toList(), next);
  }

  public NoticeDetailResponse detail(UUID me, CrewMembership crew, UUID noticeId) {
    NoticeRow row = visible(me, crew, noticeId);
    return new NoticeDetailResponse(
        row.id().toString(),
        row.title(),
        preview(row.body()),
        row.pinned(),
        row.commentCount(),
        row.createdAt(),
        row.body(),
        queryRepository.findComments(me, noticeId).stream().map(this::comment).toList());
  }

  /** GET /crew 의 pinnedNotice. 목록의 pinned 와 같은 한 건이다. */
  public Optional<LatestNotice> latest(UUID crewId) {
    return queryRepository.findLatest(crewId);
  }

  @Transactional
  public Created create(UUID me, CrewMembership crew, CreateNoticeRequest request) {
    requireLeader(crew, me);
    String title = text(request.title(), MAX_TITLE, "제목");
    String body = text(request.body(), MAX_BODY, "본문");
    if (noticeRepository.insertIfAbsent(
            request.id(), crew.crewId(), me, title, body, clock.instant())
        == 0) {
      Notice same = noticeRepository.findById(request.id()).orElseThrow(NoticeService::notFound);
      if (!same.getAuthorId().equals(me) || !same.getCrewId().equals(crew.crewId())) {
        throw new BusinessException(ErrorCode.FORBIDDEN, "남의 공지 id 다");
      }
      return new Created(false, response(visible(me, crew, request.id())));
    }
    events.publishEvent(new NoticeCreatedEvent(crew.crewId(), request.id(), me));
    return new Created(true, response(visible(me, crew, request.id())));
  }

  @Transactional
  public void update(UUID me, CrewMembership crew, UUID noticeId, UpdateNoticeRequest request) {
    visible(me, crew, noticeId);
    requireLeader(crew, me);
    String title = request.title() == null ? null : text(request.title(), MAX_TITLE, "제목");
    String body = request.body() == null ? null : text(request.body(), MAX_BODY, "본문");
    lockLive(noticeId).update(title, body, clock.instant());
  }

  @Transactional
  public void delete(UUID me, CrewMembership crew, UUID noticeId) {
    visible(me, crew, noticeId);
    requireLeader(crew, me);
    lockLive(noticeId).delete(clock.instant());
  }

  // 위의 visible 은 잠그기 전에 읽은 것이라, 그사이 삭제가 커밋됐으면 여기서 404 로 본다
  private Notice lockLive(UUID noticeId) {
    return noticeRepository
        .findForUpdate(noticeId)
        .filter(notice -> notice.getDeletedAt() == null)
        .orElseThrow(NoticeService::notFound);
  }

  @Transactional
  public CommentResponse comment(
      UUID me, CrewMembership crew, UUID noticeId, CreateCommentRequest request) {
    userLock.lock(me);
    // 주입된 소속은 잠금을 기다리기 전에 읽은 것이라, 그사이 나갔거나 추방됐으면 옛 크루에 쓰게 된다
    if (!queryRepository.lockMembership(crew.crewId(), me)) {
      throw new BusinessException(ErrorCode.NO_CREW, "소속 크루가 없다");
    }
    visible(me, crew, noticeId);
    NoticeComment same = commentRepository.findById(request.id()).orElse(null);
    if (same != null) {
      if (!same.writtenBy(me) || !same.getNoticeId().equals(noticeId)) {
        throw new BusinessException(ErrorCode.FORBIDDEN, "남의 댓글 id 다");
      }
      return comment(visibleComment(me, crew, same.getId()));
    }
    String text = text(request.text(), MAX_COMMENT, "댓글");

    // 잠금은 같은 사람만 줄 세운다. 남이 같은 id 로 먼저 넣었으면 덮어쓰지 않고 남의 id 로 본다
    if (commentRepository.insertIfAbsent(request.id(), noticeId, me, text, clock.instant()) == 0) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "남의 댓글 id 다");
    }
    return comment(visibleComment(me, crew, request.id()));
  }

  @Transactional
  public void deleteComment(UUID me, CrewMembership crew, UUID commentId) {
    visibleComment(me, crew, commentId);
    NoticeComment comment =
        commentRepository.findById(commentId).orElseThrow(NoticeService::commentNotFound);
    // 주입된 크루장 여부는 요청 시작 때 것이라, 그사이 위임이 커밋됐으면 옛 권한으로 지우게 된다
    if (!comment.writtenBy(me) && !queryRepository.lockLeader(crew.crewId(), me)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "작성자나 크루장만 지울 수 있다");
    }
    comment.delete(me, clock.instant());
  }

  // 주입된 크루장 여부는 요청 시작 때 것이라, 그사이 위임이 커밋됐으면 옛 권한으로 쓰게 된다
  private void requireLeader(CrewMembership crew, UUID me) {
    if (!queryRepository.lockLeader(crew.crewId(), me)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "크루장만 할 수 있다");
    }
  }

  private NoticeRow visible(UUID me, CrewMembership crew, UUID noticeId) {
    NoticeRow row = queryRepository.find(me, noticeId).orElseThrow(NoticeService::notFound);
    if (!row.crewId().equals(crew.crewId())) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "다른 크루의 공지다");
    }
    return row;
  }

  private CommentRow visibleComment(UUID me, CrewMembership crew, UUID commentId) {
    CommentRow row =
        queryRepository
            .findVisibleComment(me, commentId)
            .orElseThrow(NoticeService::commentNotFound);
    if (!row.crewId().equals(crew.crewId())) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "다른 크루의 공지다");
    }
    return row;
  }

  private static NoticeResponse response(NoticeRow row) {
    return new NoticeResponse(
        row.id().toString(),
        row.title(),
        preview(row.body()),
        row.pinned(),
        row.commentCount(),
        row.createdAt());
  }

  // 코드포인트로 잘라야 이모지가 반으로 갈리지 않는다
  private static String preview(String body) {
    String line = body.replaceAll("\\r\\n|\\r|\\n", " ");
    return line.substring(
        0, line.offsetByCodePoints(0, Math.min(PREVIEW, line.codePointCount(0, line.length()))));
  }

  private CommentResponse comment(CommentRow row) {
    return new CommentResponse(row.id().toString(), author(row), row.text(), row.createdAt());
  }

  // 탈퇴한 사람은 이름·사진 없이 "탈퇴한 크루원" 으로 보인다 (ERD 회원 탈퇴 때)
  private UserBriefResponse author(CommentRow row) {
    if ("DELETED".equals(row.status())) {
      return new UserBriefResponse(row.authorId().toString(), WITHDRAWN_NICKNAME, null, true);
    }
    return new UserBriefResponse(
        row.authorId().toString(),
        Objects.requireNonNullElse(row.nickname(), ""),
        row.photoKey() == null ? null : signedUrl.of(row.photoKey()),
        false);
  }

  private static String text(String value, int max, String what) {
    String text = value.strip();
    int length = text.codePointCount(0, text.length());
    if (length < 1 || length > max) {
      throw new BusinessException(ErrorCode.VALIDATION, what + "은 1~" + max + "자다");
    }
    return text;
  }

  private static BusinessException notFound() {
    return new BusinessException(ErrorCode.NOT_FOUND, "없는 공지다");
  }

  private static BusinessException commentNotFound() {
    return new BusinessException(ErrorCode.NOT_FOUND, "없는 댓글이다");
  }
}
