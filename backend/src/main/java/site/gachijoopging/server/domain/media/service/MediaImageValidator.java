package site.gachijoopging.server.domain.media.service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

@Component
public class MediaImageValidator {

  private static final long MAX_BYTES = 10L * 1024 * 1024;
  private static final int MAX_EDGE = 4096;
  private static final String JPEG = "jpeg";
  private static final Set<String> FORMATS = Set.of(JPEG, "png", "webp");

  public MediaImageValidator() {
    // 실행 jar 에서는 ImageIO 가 처음 쓰일 때의 클래스로더가 WebP 플러그인을 못 볼 수 있다
    ImageIO.scanForPlugins();
  }

  /** 받을 수 있는 사진이면 JPEG 인지를 돌려준다. JPEG 가 아니면 저장·추론 전에 바꿔야 한다. */
  public boolean validate(byte[] content) {
    if (content.length > MAX_BYTES) {
      throw new BusinessException(ErrorCode.PAYLOAD_TOO_LARGE, "사진이 10MB 를 넘는다: " + content.length);
    }
    return JPEG.equals(measureSizeAndType(content));
  }

  private static String measureSizeAndType(byte[] content) {
    try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(content))) {
      Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
      if (!readers.hasNext()) {
        throw new BusinessException(ErrorCode.VALIDATION, "사진으로 읽을 수 없다");
      }
      ImageReader reader = readers.next();
      try {
        reader.setInput(in);
        String format = reader.getFormatName().toLowerCase(Locale.ROOT);
        if (!FORMATS.contains(format)) {
          throw new BusinessException(
              ErrorCode.VALIDATION, "JPEG·PNG·WebP 가 아니다: " + reader.getFormatName());
        }
        int longSide = Math.max(reader.getWidth(0), reader.getHeight(0));
        if (longSide > MAX_EDGE) {
          throw new BusinessException(ErrorCode.VALIDATION, "픽셀 장변이 4096 을 넘는다: " + longSide);
        }
        return format;
      } finally {
        reader.dispose();
      }
    } catch (IOException e) {
      throw new BusinessException(ErrorCode.VALIDATION, "사진 헤더를 읽을 수 없다");
    }
  }
}
