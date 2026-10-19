package site.gachijoopging.server.domain.media.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import site.gachijoopging.server.support.IntegrationTest;

class MediaRepositoryTest extends IntegrationTest {

  @Autowired private MediaRepository mediaRepository;
  @Autowired private JdbcTemplate jdbc;

  @Test
  void 내가_올린_사진이면_참이다() {
    UUID 나 = 사용자를_만든다();
    UUID 내_사진 = 미디어를_만든다(나);

    assertThat(mediaRepository.existsByIdAndOwnerId(내_사진, 나)).isTrue();
  }

  @Test
  void 남이_올린_사진이면_거짓이다() {
    UUID 나 = 사용자를_만든다();
    UUID 남 = 사용자를_만든다();
    UUID 남의_사진 = 미디어를_만든다(남);

    assertThat(mediaRepository.existsByIdAndOwnerId(남의_사진, 나)).isFalse();
  }

  @Test
  void 없는_사진이면_거짓이다() {
    UUID 나 = 사용자를_만든다();

    assertThat(mediaRepository.existsByIdAndOwnerId(UUID.randomUUID(), 나)).isFalse();
  }

  private UUID 사용자를_만든다() {
    return jdbc.queryForObject(
        "INSERT INTO users (id, updated_at) VALUES (gen_random_uuid(), now()) RETURNING id",
        UUID.class);
  }

  private UUID 미디어를_만든다(UUID 주인) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO media (id, owner_id, purpose, object_key, thumb_key) VALUES (?, ?, 'POST', 'o', 't')",
        id,
        주인);
    return id;
  }
}
