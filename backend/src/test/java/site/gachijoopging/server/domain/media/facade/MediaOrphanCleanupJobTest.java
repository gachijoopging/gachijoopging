package site.gachijoopging.server.domain.media.facade;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import site.gachijoopging.server.support.IntegrationTest;

class MediaOrphanCleanupJobTest extends IntegrationTest {

  // 다른 테스트가 올린 파일과 섞이지 않도록 업로드가 쓰지 않는 과거 폴더를 쓴다
  private static final String 폴더 = "1999/01/";

  @Autowired private MediaOrphanCleanupJob job;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private Clock clock;

  @Value("${app.media.root}")
  private String mediaRoot;

  private UUID 사용자;
  private Instant 유예_지남;
  private Instant 유예_안;

  @BeforeEach
  void 사용자를_만든다() {
    사용자 =
        jdbcTemplate.queryForObject(
            "INSERT INTO users (id, email, updated_at) VALUES (gen_random_uuid(), ?, now()) RETURNING id",
            UUID.class,
            "orphan-" + UUID.randomUUID().toString().substring(0, 8) + "@test.io");
    유예_지남 = clock.instant().minus(Duration.ofHours(2));
    유예_안 = clock.instant().minus(Duration.ofMinutes(10));
  }

  @Test
  void 행이_없고_유예가_지난_파일만_지우고_행이_가리키는_파일과_유예_안의_파일은_남긴다() throws IOException {
    String 고아 = 쓴다(폴더 + 이름("orphan"), 유예_지남);
    String 원본 = 쓴다(폴더 + 이름("kept"), 유예_지남);
    String 썸네일 = 쓴다(원본.replace(".jpg", "_thumb.jpg"), 유예_지남);
    행을_만든다(원본, 썸네일);
    String 업로드_중 = 쓴다(폴더 + 이름("uploading"), 유예_안);

    job.removeOrphans();

    assertThat(있다(고아)).isFalse();
    assertThat(있다(원본)).isTrue();
    assertThat(있다(썸네일)).isTrue();
    assertThat(있다(업로드_중)).isTrue();
  }

  @Test
  void 격리된_사진은_파일과_행의_키_중_한쪽만_deleted_여도_남기고_아무도_안_가리키면_지운다() throws IOException {
    // 옮기기에 성공하면 파일만 deleted/ 로 가고, 실패하면 행의 키만 deleted/ 로 바뀐다
    String 옮겨진_원본 = 폴더 + 이름("moved");
    String 옮겨진_파일 = 쓴다("deleted/" + 옮겨진_원본, 유예_지남);
    행을_만든다(옮겨진_원본, 옮겨진_원본.replace(".jpg", "_thumb.jpg"));

    String 못_옮긴_파일 = 쓴다(폴더 + 이름("stuck"), 유예_지남);
    행을_만든다("deleted/" + 못_옮긴_파일, "deleted/" + 못_옮긴_파일.replace(".jpg", "_thumb.jpg"));

    String 격리_고아 = 쓴다("deleted/" + 폴더 + 이름("quarantined-orphan"), 유예_지남);

    job.removeOrphans();

    assertThat(있다(옮겨진_파일)).isTrue();
    assertThat(있다(못_옮긴_파일)).isTrue();
    assertThat(있다(격리_고아)).isFalse();
  }

  private static String 이름(String 표시) {
    return UUID.randomUUID() + "-" + 표시 + ".jpg";
  }

  private String 쓴다(String key, Instant 수정_시각) throws IOException {
    Path 파일 = Path.of(mediaRoot).resolve(key);
    Files.createDirectories(파일.getParent());
    Files.write(파일, new byte[] {1, 2, 3});
    Files.setLastModifiedTime(파일, FileTime.from(수정_시각));
    return key;
  }

  private void 행을_만든다(String objectKey, String thumbKey) {
    jdbcTemplate.update(
        "INSERT INTO media (id, owner_id, object_key, thumb_key, purpose) VALUES (?, ?, ?, ?, 'POST')",
        UUID.randomUUID(),
        사용자,
        objectKey,
        thumbKey);
  }

  private boolean 있다(String key) {
    return Files.exists(Path.of(mediaRoot).resolve(key));
  }
}
