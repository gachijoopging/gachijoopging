package site.gachijoopging.server.domain.post.service;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;
import site.gachijoopging.server.domain.media.entity.MediaPurpose;
import site.gachijoopging.server.domain.media.event.MediaQuarantineEvent;
import site.gachijoopging.server.domain.media.service.MediaService;
import site.gachijoopging.server.domain.media.service.MediaSignedUrl;
import site.gachijoopging.server.domain.post.dto.CommentResponse;
import site.gachijoopging.server.domain.post.dto.CreateCommentRequest;
import site.gachijoopging.server.domain.post.dto.CreatePostRequest;
import site.gachijoopging.server.domain.post.dto.PostDetailResponse;
import site.gachijoopging.server.domain.post.dto.PostMediaResponse;
import site.gachijoopging.server.domain.post.dto.PostResponse;
import site.gachijoopging.server.domain.post.dto.PostScope;
import site.gachijoopging.server.domain.post.entity.Comment;
import site.gachijoopging.server.domain.post.entity.Post;
import site.gachijoopging.server.domain.post.event.CommentCreatedEvent;
import site.gachijoopging.server.domain.post.repository.CommentRepository;
import site.gachijoopging.server.domain.post.repository.PostQueryRepository;
import site.gachijoopging.server.domain.post.repository.PostQueryRepository.CommentRow;
import site.gachijoopging.server.domain.post.repository.PostQueryRepository.MediaRow;
import site.gachijoopging.server.domain.post.repository.PostQueryRepository.PostRow;
import site.gachijoopging.server.domain.post.repository.PostRepository;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.lock.UserLock;
import site.gachijoopging.server.global.response.CursorPage;
import site.gachijoopging.server.global.response.Cursors;
import site.gachijoopging.server.global.security.CrewMembership;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PostService {

  private static final ZoneId KST = ZoneId.of("Asia/Seoul");

  private static final int MAX_TEXT = 1000;

  private static final int MAX_COMMENT = 500;

  private static final int DETAIL_COMMENTS = 20;

  private static final String WITHDRAWN_NICKNAME = "탈퇴한 크루원";

  private final PostRepository postRepository;
  private final CommentRepository commentRepository;
  private final PostQueryRepository queryRepository;
  private final MediaService mediaService;
  private final MediaSignedUrl signedUrl;
  private final ApplicationEventPublisher events;
  private final UserLock userLock;
  private final Clock clock;

  public CursorPage<PostResponse> feed(
      UUID me,
      CrewMembership crew,
      PostScope scope,
      LocalDate from,
      LocalDate to,
      String cursor,
      int limit) {
    if ((from == null) != (to == null) || (from != null && from.isAfter(to))) {
      throw invalid("from·to 는 함께, from 이 to 보다 앞서지 않게 보낸다");
    }
    Instant fromAt = from == null ? null : from.atStartOfDay(KST).toInstant();
    Instant toAt = to == null ? null : to.plusDays(1).atStartOfDay(KST).toInstant();
    UUID author = scope == PostScope.MINE ? me : null;
    return page(me, crew, scope == PostScope.CREW, author, fromAt, toAt, cursor, limit);
  }

  // 크루원 프로필(GET /crew/members/{userId})처럼 지금 크루원이 아니면 404 다
  public CursorPage<PostResponse> memberPosts(
      UUID me, CrewMembership crew, UUID userId, String cursor, int limit) {
    if (!queryRepository.isMember(crew.crewId(), userId)) {
      throw new BusinessException(ErrorCode.NOT_FOUND, "크루원이 아니다");
    }
    return page(me, crew, false, userId, null, null, cursor, limit);
  }

  public PostDetailResponse detail(UUID me, CrewMembership crew, UUID postId) {
    PostResponse post = post(me, crew, postId);
    CursorPage<CommentResponse> comments = commentPage(me, postId, null, DETAIL_COMMENTS);
    return PostDetailResponse.of(post, comments.items(), comments.nextCursor());
  }

  public CursorPage<CommentResponse> comments(
      UUID me, CrewMembership crew, UUID postId, String cursor, int limit) {
    visible(me, crew, postId);
    return commentPage(me, postId, cursor, limit);
  }

  @Transactional
  public CommentResponse comment(
      UUID me, CrewMembership crew, UUID postId, CreateCommentRequest request) {
    userLock.lock(me);
    // 주입된 소속은 잠금을 기다리기 전에 읽은 것이라, 그사이 나갔거나 추방됐으면 옛 크루에 쓰게 된다
    if (!queryRepository.lockMembership(crew.crewId(), me)) {
      throw new BusinessException(ErrorCode.NO_CREW, "소속 크루가 없다");
    }
    PostRow post = visible(me, crew, postId);
    Comment same = commentRepository.findById(request.id()).orElse(null);
    if (same != null) {
      if (!same.writtenBy(me) || !same.getPostId().equals(postId)) {
        throw new BusinessException(ErrorCode.FORBIDDEN, "남의 댓글 id 다");
      }
      return visibleComment(me, crew, same.getId());
    }
    String text = request.text().strip();
    int length = text.codePointCount(0, text.length());
    if (length < 1 || length > MAX_COMMENT) {
      throw invalid("댓글은 1~" + MAX_COMMENT + "자다");
    }

    // 잠금은 같은 사람만 줄 세운다. 남이 같은 id 로 먼저 넣었으면 덮어쓰지 않고 남의 id 로 본다
    if (commentRepository.insertIfAbsent(request.id(), postId, me, text, clock.instant()) == 0) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "남의 댓글 id 다");
    }
    events.publishEvent(new CommentCreatedEvent(postId, post.authorId(), request.id(), me));
    return visibleComment(me, crew, request.id());
  }

  @Transactional
  public void deleteComment(UUID me, CrewMembership crew, UUID commentId) {
    visibleComment(me, crew, commentId);
    Comment comment =
        commentRepository.findById(commentId).orElseThrow(PostService::commentNotFound);
    // 주입된 크루장 여부는 요청 시작 때 것이라, 그사이 위임이 커밋됐으면 옛 권한으로 지우게 된다
    if (!comment.writtenBy(me) && !queryRepository.lockLeader(crew.crewId(), me)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "작성자나 크루장만 지울 수 있다");
    }
    comment.delete(me, clock.instant());
  }

  // 같은 사람의 작성을 줄 세워 같은 id 재전송과 같은 사진 중복 첨부가 엇갈리지 않게 한다
  @Transactional
  public PostResponse create(UUID me, CrewMembership crew, CreatePostRequest request) {
    userLock.lock(me);
    // 주입된 소속은 잠금을 기다리기 전에 읽은 것이라, 그사이 나갔거나 추방됐으면 옛 크루에 쓰게 된다
    if (!queryRepository.lockMembership(crew.crewId(), me)) {
      throw new BusinessException(ErrorCode.NO_CREW, "소속 크루가 없다");
    }
    Post same = postRepository.findById(request.id()).orElse(null);
    if (same != null) {
      if (!same.writtenBy(me)) {
        throw new BusinessException(ErrorCode.FORBIDDEN, "남의 게시물 id 다");
      }
      return post(me, crew, same.getId());
    }
    requireContent(request);
    request.mediaIds().forEach(mediaId -> requireAttachable(me, mediaId));

    // 잠금은 같은 사람만 줄 세운다. 남이 같은 id 로 먼저 넣었으면 덮어쓰지 않고 남의 id 로 본다
    if (postRepository.insertIfAbsent(
            request.id(),
            crew.crewId(),
            me,
            request.text(),
            request.visibility().name(),
            clock.instant())
        == 0) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "남의 게시물 id 다");
    }
    for (int i = 0; i < request.mediaIds().size(); i++) {
      postRepository.attach(request.id(), request.mediaIds().get(i), i);
    }
    return post(me, crew, request.id());
  }

  @Transactional
  public void delete(UUID me, CrewMembership crew, UUID postId) {
    visible(me, crew, postId);
    Post post = postRepository.findById(postId).orElseThrow(PostService::notFound);
    // 주입된 크루장 여부는 요청 시작 때 것이라, 그사이 위임이 커밋됐으면 옛 권한으로 지우게 된다
    if (!post.writtenBy(me) && !queryRepository.lockLeader(crew.crewId(), me)) {
      throw new BusinessException(ErrorCode.FORBIDDEN, "작성자나 크루장만 지울 수 있다");
    }
    remove(post, me);
  }

  // 신고 처리의 삭제는 크루장 관리라 차단과 무관하다. 이미 지워졌으면 처음 지운 사람을 덮어쓰지 않는다
  @Transactional(propagation = Propagation.MANDATORY)
  public void deleteReported(UUID leaderId, UUID crewId, UUID postId) {
    postRepository
        .findById(postId)
        .filter(post -> post.getCrewId().equals(crewId) && post.getDeletedAt() == null)
        .ifPresent(post -> remove(post, leaderId));
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void deleteReportedComment(UUID leaderId, UUID crewId, UUID commentId) {
    commentRepository
        .findById(commentId)
        .filter(comment -> comment.getDeletedAt() == null)
        .filter(
            comment ->
                postRepository
                    .findById(comment.getPostId())
                    .filter(post -> post.getCrewId().equals(crewId))
                    .isPresent())
        .ifPresent(comment -> comment.delete(leaderId, clock.instant()));
  }

  private void remove(Post post, UUID by) {
    UUID postId = post.getId();
    post.delete(by, clock.instant());
    List<String> keys = new ArrayList<>();
    queryRepository
        .findMedia(List.of(postId))
        .getOrDefault(postId, List.of())
        .forEach(
            media -> {
              keys.add(media.objectKey());
              keys.add(media.thumbKey());
            });
    keys.removeIf(Objects::isNull);
    events.publishEvent(new MediaQuarantineEvent(keys));
  }

  @Transactional
  public void like(UUID me, CrewMembership crew, UUID postId) {
    visible(me, crew, postId);
    postRepository.like(postId, me);
  }

  @Transactional
  public void unlike(UUID me, CrewMembership crew, UUID postId) {
    visible(me, crew, postId);
    postRepository.unlike(postId, me);
  }

  private CursorPage<PostResponse> page(
      UUID me,
      CrewMembership crew,
      boolean crewOnly,
      UUID authorId,
      Instant fromAt,
      Instant toAt,
      String cursor,
      int limit) {
    Cursors.Cursor before = cursor == null ? null : Cursors.decode(cursor);
    List<PostRow> rows =
        queryRepository.findPage(
            me,
            crew.crewId(),
            new PostQueryRepository.Filter(
                crewOnly,
                authorId,
                fromAt,
                toAt,
                before == null ? null : before.createdAt(),
                before == null ? null : before.id()),
            limit + 1);
    List<PostRow> page = rows.subList(0, Math.min(limit, rows.size()));
    String next =
        rows.size() > limit
            ? Cursors.encode(page.getLast().createdAt(), page.getLast().id())
            : null;
    return new CursorPage<>(responses(page), next);
  }

  // 장은 과거 방향으로 넘기고 한 장 안은 오래된 것부터 보인다 (openapi GET /posts/{postId}/comments)
  private CursorPage<CommentResponse> commentPage(UUID me, UUID postId, String cursor, int limit) {
    Cursors.Cursor before = cursor == null ? null : Cursors.decode(cursor);
    List<CommentRow> rows =
        queryRepository.findComments(
            me,
            postId,
            before == null ? null : before.createdAt(),
            before == null ? null : before.id(),
            limit + 1);
    List<CommentRow> page = rows.subList(0, Math.min(limit, rows.size()));
    String next =
        rows.size() > limit
            ? Cursors.encode(page.getLast().createdAt(), page.getLast().id())
            : null;
    return new CursorPage<>(page.reversed().stream().map(this::comment).toList(), next);
  }

  private CommentResponse visibleComment(UUID me, CrewMembership crew, UUID commentId) {
    return queryRepository
        .findVisibleComment(me, crew.crewId(), commentId)
        .map(this::comment)
        .orElseThrow(PostService::commentNotFound);
  }

  private CommentResponse comment(CommentRow row) {
    return new CommentResponse(
        row.id().toString(),
        author(row.authorId(), row.status(), row.nickname(), row.photoKey()),
        row.text(),
        row.createdAt());
  }

  private PostResponse post(UUID me, CrewMembership crew, UUID postId) {
    return responses(List.of(visible(me, crew, postId))).getFirst();
  }

  private PostRow visible(UUID me, CrewMembership crew, UUID postId) {
    return queryRepository
        .findVisible(me, crew.crewId(), postId)
        .orElseThrow(PostService::notFound);
  }

  private List<PostResponse> responses(List<PostRow> rows) {
    Map<UUID, List<MediaRow>> media =
        queryRepository.findMedia(rows.stream().map(PostRow::id).toList());
    return rows.stream()
        .map(
            row ->
                new PostResponse(
                    row.id().toString(),
                    author(row.authorId(), row.status(), row.nickname(), row.photoKey()),
                    row.text(),
                    row.visibility(),
                    media.getOrDefault(row.id(), List.of()).stream()
                        .map(m -> new PostMediaResponse(url(m.objectKey()), url(m.thumbKey())))
                        .toList(),
                    row.likeCount(),
                    row.liked(),
                    row.commentCount(),
                    row.createdAt()))
        .toList();
  }

  // 탈퇴한 사람은 이름·사진 없이 "탈퇴한 크루원" 으로 보인다 (ERD 회원 탈퇴 때)
  private UserBriefResponse author(UUID id, String status, String nickname, String photoKey) {
    if ("DELETED".equals(status)) {
      return new UserBriefResponse(id.toString(), WITHDRAWN_NICKNAME, null, true);
    }
    return new UserBriefResponse(
        id.toString(), Objects.requireNonNullElse(nickname, ""), url(photoKey), false);
  }

  private String url(String key) {
    return key == null ? null : signedUrl.of(key);
  }

  private static void requireContent(CreatePostRequest request) {
    String text = request.text();
    if (text.isBlank() && request.mediaIds().isEmpty()) {
      throw invalid("본문이나 사진이 하나는 있어야 한다");
    }
    if (text.codePointCount(0, text.length()) > MAX_TEXT) {
      throw invalid("본문은 " + MAX_TEXT + "자까지다");
    }
    if (new HashSet<>(request.mediaIds()).size() != request.mediaIds().size()) {
      throw invalid("같은 사진을 두 번 붙였다");
    }
  }

  // 지운 게시물의 사진도 다시 붙이지 않는다 — 그 파일은 이미 deleted/ 로 옮겨져 열리지 않는다
  private void requireAttachable(UUID me, UUID mediaId) {
    mediaService
        .find(mediaId)
        .filter(media -> media.ownerId().equals(me) && media.purpose() == MediaPurpose.POST)
        .orElseThrow(() -> invalid("쓸 수 없는 mediaId 다: " + mediaId));
    if (postRepository.attached(mediaId)) {
      throw new BusinessException(ErrorCode.CONFLICT, "이미 게시물에 붙은 사진이다: " + mediaId);
    }
  }

  private static BusinessException invalid(String message) {
    return new BusinessException(ErrorCode.VALIDATION, message);
  }

  private static BusinessException notFound() {
    return new BusinessException(ErrorCode.NOT_FOUND, "없는 게시물이다");
  }

  private static BusinessException commentNotFound() {
    return new BusinessException(ErrorCode.NOT_FOUND, "없는 댓글이다");
  }
}
