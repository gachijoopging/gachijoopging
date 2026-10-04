package site.gachijoopging.server.domain.media.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

class MediaImageValidatorTest {

  private final MediaImageValidator validator = new MediaImageValidator();

  @Test
  void 정상_사진은_통과한다() throws IOException {
    assertThatCode(() -> validator.validate(jpeg(2048, 1536))).doesNotThrowAnyException();
  }

  @Test
  void 장변_4096_까지는_통과한다() throws IOException {
    assertThatCode(() -> validator.validate(jpeg(4096, 100))).doesNotThrowAnyException();
  }

  @Test
  void 장변이_4096을_넘으면_422() throws IOException {
    assertThatThrownBy(() -> validator.validate(jpeg(4097, 100)))
        .satisfies(MediaImageValidatorTest::사용자_입력_오류다);
  }

  @Test
  void 높이가_4096을_넘어도_422() throws IOException {
    assertThatThrownBy(() -> validator.validate(jpeg(100, 4097)))
        .satisfies(MediaImageValidatorTest::사용자_입력_오류다);
  }

  @Test
  void _20MB를_넘으면_422() {
    byte[] 큰_파일 = new byte[20 * 1024 * 1024 + 1];

    assertThatThrownBy(() -> validator.validate(큰_파일))
        .satisfies(MediaImageValidatorTest::사용자_입력_오류다);
  }

  @Test
  void 이미지가_아니면_422() {
    byte[] 텍스트 = "사진이 아니다".getBytes(StandardCharsets.UTF_8);

    assertThatThrownBy(() -> validator.validate(텍스트))
        .satisfies(MediaImageValidatorTest::사용자_입력_오류다);
  }

  @Test
  void JPEG가_아니면_422() throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(100, 100, BufferedImage.TYPE_INT_RGB), "png", out);

    assertThatThrownBy(() -> validator.validate(out.toByteArray()))
        .satisfies(MediaImageValidatorTest::사용자_입력_오류다);
  }

  private static void 사용자_입력_오류다(Throwable 오류) {
    assertThat(오류).isInstanceOf(BusinessException.class);
    assertThat(((BusinessException) 오류).errorCode()).isEqualTo(ErrorCode.VALIDATION);
  }

  private static byte[] jpeg(int 너비, int 높이) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(너비, 높이, BufferedImage.TYPE_INT_RGB), "jpg", out);
    return out.toByteArray();
  }
}
