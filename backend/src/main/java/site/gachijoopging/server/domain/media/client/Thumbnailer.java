package site.gachijoopging.server.domain.media.client;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import net.coobird.thumbnailator.Thumbnails;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

@Component
public class Thumbnailer {

  private static final int LONG_EDGE = 512;

  public byte[] of(byte[] original) {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    try {
      Thumbnails.of(new ByteArrayInputStream(original))
          .size(LONG_EDGE, LONG_EDGE)
          .outputFormat("jpg")
          .toOutputStream(out);
    } catch (IOException e) {
      throw new BusinessException(ErrorCode.VALIDATION, "썸네일을 만들 수 없는 사진이다");
    }
    return out.toByteArray();
  }
}
