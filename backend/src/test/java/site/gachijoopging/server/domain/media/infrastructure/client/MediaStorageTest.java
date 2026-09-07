package site.gachijoopging.server.domain.media.infrastructure.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import site.gachijoopging.server.domain.media.domain.policy.MediaProperties;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

class MediaStorageTest {

  @TempDir Path root;

  private MediaStorage mediaStorage;

  @BeforeEach
  void setUp() {
    mediaStorage =
        new MediaStorage(new MediaProperties(root.toString(), "무관", "무관", Duration.ZERO));
  }

  @Test
  void 키_경로_그대로_파일을_쓴다() throws IOException {
    mediaStorage.store("2026/08/사진.jpg", "내용".getBytes(StandardCharsets.UTF_8));

    assertThat(Files.readString(root.resolve("2026/08/사진.jpg"))).isEqualTo("내용");
  }

  @Test
  void 중간_디렉터리가_없으면_만든다() {
    mediaStorage.store("2026/08/사진.jpg", new byte[] {1});

    assertThat(Files.isDirectory(root.resolve("2026/08"))).isTrue();
  }

  @Test
  void 상위_디렉터리로_빠져나가는_키는_거부한다() {
    assertThatThrownBy(() -> mediaStorage.store("../탈출.jpg", new byte[] {1}))
        .isInstanceOf(BusinessException.class)
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.INTERNAL);

    assertThat(Files.exists(root.getParent().resolve("탈출.jpg"))).isFalse();
  }

  @Test
  void 절대_경로_키도_거부한다() {
    assertThatThrownBy(() -> mediaStorage.store("/etc/탈출.jpg", new byte[] {1}))
        .isInstanceOf(BusinessException.class);
  }

  @Test
  void 옮기면_원래_키에는_없고_새_키에_있다() throws IOException {
    mediaStorage.store("2026/08/사진.jpg", "내용".getBytes(StandardCharsets.UTF_8));

    mediaStorage.move("2026/08/사진.jpg", "deleted/2026/08/사진.jpg");

    assertThat(Files.exists(root.resolve("2026/08/사진.jpg"))).isFalse();
    assertThat(Files.readString(root.resolve("deleted/2026/08/사진.jpg"))).isEqualTo("내용");
  }

  @Test
  void 옮길_곳의_중간_디렉터리가_없으면_만든다() {
    mediaStorage.store("2026/08/사진.jpg", new byte[] {1});

    mediaStorage.move("2026/08/사진.jpg", "deleted/2026/08/사진.jpg");

    assertThat(Files.isDirectory(root.resolve("deleted/2026/08"))).isTrue();
  }

  @Test
  void 경계를_벗어나는_대상_키는_거부한다() {
    mediaStorage.store("2026/08/사진.jpg", new byte[] {1});

    assertThatThrownBy(() -> mediaStorage.move("2026/08/사진.jpg", "../탈출.jpg"))
        .isInstanceOf(BusinessException.class)
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.INTERNAL);

    assertThat(Files.exists(root.getParent().resolve("탈출.jpg"))).isFalse();
  }

  @Test
  void 옮길_파일이_없으면_터진다() {
    assertThatThrownBy(() -> mediaStorage.move("없는/사진.jpg", "deleted/없는/사진.jpg"))
        .isInstanceOf(UncheckedIOException.class);
  }
}
