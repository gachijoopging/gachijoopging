package site.gachijoopging.server.domain.media.client;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import net.coobird.thumbnailator.Thumbnails;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

@Component
public class Thumbnailer {

  private static final int LONG_EDGE = 512;
  private static final double JPEG_QUALITY = 0.92;

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

  // AI 서버는 JPEG 만 받고 저장 키도 .jpg 라 PNG·WebP 는 들어올 때 JPEG 로 바꾼다.
  // JPEG 에는 투명도가 없어 그대로 쓰면 투명한 곳이 검게 나오므로 흰 바탕에 얹는다
  public byte[] toJpeg(byte[] original) {
    try {
      BufferedImage source = ImageIO.read(new ByteArrayInputStream(original));
      if (source == null) {
        throw new BusinessException(ErrorCode.VALIDATION, "사진으로 읽을 수 없다");
      }
      BufferedImage rgb =
          new BufferedImage(source.getWidth(), source.getHeight(), BufferedImage.TYPE_INT_RGB);
      Graphics2D graphics = rgb.createGraphics();
      try {
        graphics.drawImage(source, 0, 0, Color.WHITE, null);
      } finally {
        graphics.dispose();
      }
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      Thumbnails.of(rgb)
          .scale(1.0)
          .outputFormat("jpg")
          .outputQuality(JPEG_QUALITY)
          .toOutputStream(out);
      return out.toByteArray();
    } catch (IOException e) {
      throw new BusinessException(ErrorCode.VALIDATION, "JPEG 로 바꿀 수 없는 사진이다");
    }
  }
}
