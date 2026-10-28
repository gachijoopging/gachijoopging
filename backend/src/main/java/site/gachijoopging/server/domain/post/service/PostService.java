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
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;
import site.gachijoopging.server.domain.media.entity.MediaPurpose;
import site.gachijoopging.server.domain.media.event.MediaQuarantineEvent;
import site.gachijoopging.server.domain.media.service.MediaService;
import site.gachijoopging.server.domain.media.service.MediaSignedUrl;
import site.gachijoopging.server.domain.post.dto.CreatePostRequest;
import site.gachijoopging.server.domain.post.dto.PostDetailResponse;
import site.gachijoopging.server.domain.post.dto.PostMediaResponse;
import site.gachijoopging.server.domain.post.dto.PostResponse;
import site.gachijoopging.server.domain.post.dto.PostScope;
import site.gachijoopging.server.domain.post.entity.Post;
import site.gachijoopging.server.domain.post.repository.PostQueryRepository;
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

  private static final String WITHDRAWN_NICKNAME = "탈퇴한 크루원";

  private final PostRepository postRepository;
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
    return PostDetailResponse.of(post(me, crew, postId), List.of(), null);
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
    post.delete(me, clock.instant());
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
                    author(row),
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
  private UserBriefResponse author(PostRow row) {
    if ("DELETED".equals(row.status())) {
      return new UserBriefResponse(row.authorId().toString(), WITHDRAWN_NICKNAME, null, true);
    }
    return new UserBriefResponse(
        row.authorId().toString(),
        Objects.requireNonNullElse(row.nickname(), ""),
        url(row.photoKey()),
        false);
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
}
