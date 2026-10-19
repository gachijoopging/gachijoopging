package site.gachijoopging.server.domain.media.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

class MediaImageValidatorTest {

  private final MediaImageValidator validator = new MediaImageValidator();

  // 1×1 무손실 WebP. 테스트 쪽에는 WebP 를 쓰는 인코더가 없어 바이트로 둔다
  private static final byte[] WEBP =
      Base64.getDecoder().decode("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==");

  @Test
  void 정상_사진은_통과하고_JPEG_라고_알린다() throws IOException {
    assertThat(validator.validate(jpeg(2048, 1536))).isTrue();
  }

  @Test
  void PNG_는_받고_JPEG_가_아니라고_알린다() throws IOException {
    assertThat(validator.validate(이미지(100, 100, "png"))).isFalse();
  }

  @Test
  void WebP_는_받고_JPEG_가_아니라고_알린다() {
    assertThat(validator.validate(WEBP)).isFalse();
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
  void _10MB를_넘으면_413() {
    byte[] 큰_파일 = new byte[10 * 1024 * 1024 + 1];

    assertThatThrownBy(() -> validator.validate(큰_파일))
        .isInstanceOf(BusinessException.class)
        .extracting(e -> ((BusinessException) e).errorCode())
        .isEqualTo(ErrorCode.PAYLOAD_TOO_LARGE);
  }

  @Test
  void 이미지가_아니면_422() {
    byte[] 텍스트 = "사진이 아니다".getBytes(StandardCharsets.UTF_8);

    assertThatThrownBy(() -> validator.validate(텍스트))
        .satisfies(MediaImageValidatorTest::사용자_입력_오류다);
  }

  @Test
  void JPEG_PNG_WebP_가_아니면_422() throws IOException {
    assertThatThrownBy(() -> validator.validate(이미지(100, 100, "bmp")))
        .satisfies(MediaImageValidatorTest::사용자_입력_오류다);
  }

  private static void 사용자_입력_오류다(Throwable 오류) {
    assertThat(오류).isInstanceOf(BusinessException.class);
    assertThat(((BusinessException) 오류).errorCode()).isEqualTo(ErrorCode.VALIDATION);
  }

  private static byte[] jpeg(int 너비, int 높이) throws IOException {
    return 이미지(너비, 높이, "jpg");
  }

  private static byte[] 이미지(int 너비, int 높이, String 형식) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(너비, 높이, BufferedImage.TYPE_INT_RGB), 형식, out);
    return out.toByteArray();
  }
}
