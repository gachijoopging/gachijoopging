package site.gachijoopging.server.domain.media.domain.policy;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

@Component
public class MediaImageValidator {

  private static final long MAX_BYTES = 20L * 1024 * 1024;
  private static final int MAX_EDGE = 4096;
  private static final String FORMAT = "JPEG";

  public void validate(byte[] content) {
    if (content.length > MAX_BYTES) {
      throw new BusinessException(ErrorCode.VALIDATION, "사진이 20MB 를 넘는다: " + content.length);
    }
    measureSizeAndType(content);
  }

  private static void measureSizeAndType(byte[] content) {
    try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(content))) {
      Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
      if (!readers.hasNext()) {
        throw new BusinessException(ErrorCode.VALIDATION, "사진으로 읽을 수 없다");
      }
      ImageReader reader = readers.next();
      try {
        reader.setInput(in);
        if (!FORMAT.equalsIgnoreCase(reader.getFormatName())) {
          throw new BusinessException(
              ErrorCode.VALIDATION, "JPEG 가 아니다: " + reader.getFormatName());
        }
        int longSide = Math.max(reader.getWidth(0), reader.getHeight(0));
        if (longSide > MAX_EDGE) {
          throw new BusinessException(ErrorCode.VALIDATION, "픽셀 장변이 4096 을 넘는다: " + longSide);
        }
      } finally {
        reader.dispose();
      }
    } catch (IOException e) {
      throw new BusinessException(ErrorCode.VALIDATION, "사진 헤더를 읽을 수 없다");
    }
  }
}
