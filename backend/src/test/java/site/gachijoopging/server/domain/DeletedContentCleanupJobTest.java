package site.gachijoopging.server.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import site.gachijoopging.server.domain.activity.service.ActivityCleanupJob;
import site.gachijoopging.server.domain.chat.repository.ChatMessageRepository;
import site.gachijoopging.server.domain.chat.service.ChatMessageCleanupJob;
import site.gachijoopging.server.domain.notice.service.NoticeCleanupJob;
import site.gachijoopging.server.domain.post.service.PostCleanupJob;
import site.gachijoopging.server.support.IntegrationTest;

class DeletedContentCleanupJobTest extends IntegrationTest {

  private static final Duration 보존 = Duration.ofDays(29);

  @Autowired private ActivityCleanupJob activityCleanupJob;
  @Autowired private PostCleanupJob postCleanupJob;
  @Autowired private NoticeCleanupJob noticeCleanupJob;
  @Autowired private ChatMessageCleanupJob chatMessageCleanupJob;
  @Autowired private ChatMessageRepository chatMessageRepository;
  @Autowired private PlatformTransactionManager transactionManager;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private Clock clock;

  @Value("${app.media.root}")
  private String mediaRoot;

  private UUID 사용자;
  private UUID 크루;
  private Instant 기한_넘김;
  private Instant 기한_전;

  @BeforeEach
  void 크루원을_만든다() {
    String 이름 = "cleanup-" + UUID.randomUUID().toString().substring(0, 8);
    사용자 =
        jdbcTemplate.queryForObject(
            "INSERT INTO users (id, email, updated_at) VALUES (gen_random_uuid(), ?, now()) RETURNING id",
            UUID.class,
            이름 + "@test.io");
    크루 =
        jdbcTemplate.queryForObject(
            """
            INSERT INTO crews (id, name, leader_id, updated_at, region, join_policy)
            VALUES (gen_random_uuid(), ?, ?, now(), 'SEOUL', 'OPEN') RETURNING id
            """,
            UUID.class,
            이름,
            사용자);
    기한_넘김 = clock.instant().minus(보존).minusSeconds(60);
    기한_전 = clock.instant().minus(보존).plusSeconds(60);
  }

  @Test
  void 기한이_지난_활동은_줍기_사진과_함께_지우고_격리된_사진_파일도_지운다() throws IOException {
    UUID 오래된 = 활동을_만든다(기한_넘김);
    UUID 사진 = 사진을_만든다("ACTIVITY");
    jdbcTemplate.update(
        """
        INSERT INTO activity_photos (id, activity_id, media_id, taken_at, inference_status, order_index)
        VALUES (gen_random_uuid(), ?, ?, now(), 'OK', 0)
        """,
        오래된,
        사진);
    jdbcTemplate.update(
        """
        INSERT INTO activity_items (id, activity_id, final_category, unclassified, source)
        VALUES (gen_random_uuid(), ?, 'CAN', false, 'MANUAL')
        """,
        오래된);
    UUID 최근 = 활동을_만든다(기한_전);

    activityCleanupJob.removeDeletedActivities();

    assertThat(행_수("activities", "id", 오래된)).isZero();
    assertThat(행_수("activity_items", "activity_id", 오래된)).isZero();
    assertThat(행_수("media", "id", 사진)).isZero();
    assertThat(격리_파일(사진)).doesNotExist();
    assertThat(격리_파일(사진 + "-t")).doesNotExist();
    assertThat(행_수("activities", "id", 최근)).isOne();
  }

  @Test
  void 기한이_지난_게시물은_좋아요_사진_댓글과_함께_지운다() throws IOException {
    UUID 오래된 = 게시물을_만든다(기한_넘김);
    UUID 사진 = 사진을_만든다("POST");
    jdbcTemplate.update(
        "INSERT INTO post_media (post_id, media_id, order_index) VALUES (?, ?, 0)", 오래된, 사진);
    jdbcTemplate.update("INSERT INTO post_likes (post_id, user_id) VALUES (?, ?)", 오래된, 사용자);
    댓글을_만든다(오래된, null);
    댓글을_만든다(오래된, clock.instant());
    UUID 최근 = 게시물을_만든다(기한_전);

    postCleanupJob.removeDeletedPosts();

    assertThat(행_수("posts", "id", 오래된)).isZero();
    assertThat(행_수("post_likes", "post_id", 오래된)).isZero();
    assertThat(행_수("post_media", "post_id", 오래된)).isZero();
    assertThat(행_수("comments", "post_id", 오래된)).isZero();
    assertThat(행_수("media", "id", 사진)).isZero();
    assertThat(격리_파일(사진)).doesNotExist();
    assertThat(격리_파일(사진 + "-t")).doesNotExist();
    assertThat(행_수("posts", "id", 최근)).isOne();
  }

  @Test
  void 다른_곳에_붙은_사진은_게시물을_지워도_남긴다() throws IOException {
    UUID 오래된 = 게시물을_만든다(기한_넘김);
    UUID 사진 = 사진을_만든다("POST");
    jdbcTemplate.update(
        "INSERT INTO post_media (post_id, media_id, order_index) VALUES (?, ?, 0)", 오래된, 사진);
    jdbcTemplate.update("UPDATE users SET photo_media_id = ? WHERE id = ?", 사진, 사용자);

    postCleanupJob.removeDeletedPosts();

    assertThat(행_수("posts", "id", 오래된)).isZero();
    assertThat(행_수("media", "id", 사진)).isOne();
    assertThat(격리_파일(사진)).exists();
  }

  @Test
  void 남은_게시물의_댓글은_기한이_지난_것만_지운다() {
    UUID 게시물 = 게시물을_만든다(null);
    UUID 오래된 = 댓글을_만든다(게시물, 기한_넘김);
    UUID 최근 = 댓글을_만든다(게시물, 기한_전);

    postCleanupJob.removeDeletedPosts();

    assertThat(행_수("comments", "id", 오래된)).isZero();
    assertThat(행_수("comments", "id", 최근)).isOne();
  }

  @Test
  void 기한이_지난_공지는_댓글과_함께_지우고_남은_공지의_댓글은_기한이_지난_것만_지운다() {
    UUID 오래된 = 공지를_만든다(기한_넘김);
    공지_댓글을_만든다(오래된, null);
    UUID 최근 = 공지를_만든다(기한_전);
    UUID 남은_공지 = 공지를_만든다(null);
    UUID 오래된_댓글 = 공지_댓글을_만든다(남은_공지, 기한_넘김);
    UUID 최근_댓글 = 공지_댓글을_만든다(남은_공지, 기한_전);

    noticeCleanupJob.removeDeletedNotices();

    assertThat(행_수("notices", "id", 오래된)).isZero();
    assertThat(행_수("notice_comments", "notice_id", 오래된)).isZero();
    assertThat(행_수("notices", "id", 최근)).isOne();
    assertThat(행_수("notice_comments", "id", 오래된_댓글)).isZero();
    assertThat(행_수("notice_comments", "id", 최근_댓글)).isOne();
  }

  @Test
  void 기한이_지난_채팅_메시지를_지우고_마지막_메시지를_지워도_seq_는_되돌아가지_않는다() {
    UUID 최근 = 메시지를_보낸다();
    UUID 마지막 = 메시지를_보낸다();
    jdbcTemplate.update(
        "UPDATE chat_messages SET deleted_at = ? WHERE id = ?", Timestamp.from(기한_전), 최근);
    jdbcTemplate.update(
        "UPDATE chat_messages SET deleted_at = ? WHERE id = ?", Timestamp.from(기한_넘김), 마지막);

    chatMessageCleanupJob.removeDeletedMessages();

    assertThat(행_수("chat_messages", "id", 마지막)).isZero();
    assertThat(행_수("chat_messages", "id", 최근)).isOne();
    assertThat(seq(메시지를_보낸다())).isEqualTo(3);
  }

  private UUID 메시지를_보낸다() {
    UUID 메시지 = UUID.randomUUID();
    new TransactionTemplate(transactionManager)
        .executeWithoutResult(
            status -> chatMessageRepository.insertIfAbsent(메시지, 크루, 사용자, "안녕", clock.instant()));
    return 메시지;
  }

  private long seq(UUID 메시지) {
    return jdbcTemplate.queryForObject(
        "SELECT seq FROM chat_messages WHERE id = ?", Long.class, 메시지);
  }

  private UUID 활동을_만든다(Instant 삭제) {
    return jdbcTemplate.queryForObject(
        """
        INSERT INTO activities (id, user_id, crew_id, status, started_at, ended_at, location_shared, deleted_at)
        VALUES (gen_random_uuid(), ?, ?, 'ENDED', now(), now(), true, ?) RETURNING id
        """,
        UUID.class,
        사용자,
        크루,
        시각(삭제));
  }

  // 직접 지운 콘텐츠의 사진은 이미 deleted/ 로 옮겨져 있다
  private UUID 사진을_만든다(String 용도) throws IOException {
    UUID 사진 = UUID.randomUUID();
    Files.createDirectories(격리_파일(사진).getParent());
    Files.write(격리_파일(사진), new byte[] {1});
    Files.write(격리_파일(사진 + "-t"), new byte[] {1});
    jdbcTemplate.update(
        "INSERT INTO media (id, owner_id, object_key, thumb_key, purpose) VALUES (?, ?, ?, ?, ?)",
        사진,
        사용자,
        사진.toString(),
        사진 + "-t",
        용도);
    return 사진;
  }

  private UUID 게시물을_만든다(Instant 삭제) {
    return jdbcTemplate.queryForObject(
        """
        INSERT INTO posts (id, crew_id, author_id, visibility, updated_at, deleted_at)
        VALUES (gen_random_uuid(), ?, ?, 'CREW', now(), ?) RETURNING id
        """,
        UUID.class,
        크루,
        사용자,
        시각(삭제));
  }

  private UUID 댓글을_만든다(UUID 게시물, Instant 삭제) {
    return jdbcTemplate.queryForObject(
        """
        INSERT INTO comments (id, post_id, author_id, text, deleted_at)
        VALUES (gen_random_uuid(), ?, ?, '댓글', ?) RETURNING id
        """,
        UUID.class,
        게시물,
        사용자,
        시각(삭제));
  }

  private UUID 공지를_만든다(Instant 삭제) {
    return jdbcTemplate.queryForObject(
        """
        INSERT INTO notices (id, crew_id, author_id, title, body, updated_at, deleted_at)
        VALUES (gen_random_uuid(), ?, ?, '공지', '본문', now(), ?) RETURNING id
        """,
        UUID.class,
        크루,
        사용자,
        시각(삭제));
  }

  private UUID 공지_댓글을_만든다(UUID 공지, Instant 삭제) {
    return jdbcTemplate.queryForObject(
        """
        INSERT INTO notice_comments (id, notice_id, author_id, text, deleted_at)
        VALUES (gen_random_uuid(), ?, ?, '댓글', ?) RETURNING id
        """,
        UUID.class,
        공지,
        사용자,
        시각(삭제));
  }

  private int 행_수(String 테이블, String 열, UUID 값) {
    return jdbcTemplate.queryForObject(
        "SELECT count(*) FROM " + 테이블 + " WHERE " + 열 + " = ?", Integer.class, 값);
  }

  private Path 격리_파일(Object 키) {
    return Path.of(mediaRoot, "deleted", 키.toString());
  }

  private static Timestamp 시각(Instant 시각) {
    return 시각 == null ? null : Timestamp.from(시각);
  }
}
