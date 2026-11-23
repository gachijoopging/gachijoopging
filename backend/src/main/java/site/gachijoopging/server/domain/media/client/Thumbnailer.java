package site.gachijoopging.server.domain.media.client;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.concurrent.Semaphore;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import net.coobird.thumbnailator.Thumbnails;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

@Component
public class Thumbnailer {

  private static final int LONG_EDGE = 512;
  private static final float JPEG_QUALITY = 0.92f;

  // 장변 4096 사진 한 장을 디코드하면 수백 MB 가 잡혀, 동시에 여럿이면 기본 힙(VM 2GB 의 1/4)이 넘친다.
  // 서버 전체에서 2건으로 묶으니 힙이나 VM 을 늘리면 같이 올린다
  private static final Semaphore DECODING = new Semaphore(2);

  static {
    // 실행 jar 에서는 ImageIO 가 처음 쓰일 때의 클래스로더가 WebP 플러그인을 못 볼 수 있다
    ImageIO.scanForPlugins();
  }

  public byte[] of(byte[] original) {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    DECODING.acquireUninterruptibly();
    try {
      Thumbnails.of(new ByteArrayInputStream(original))
          .size(LONG_EDGE, LONG_EDGE)
          .outputFormat("jpg")
          .toOutputStream(out);
    } catch (IOException e) {
      throw new BusinessException(ErrorCode.VALIDATION, "썸네일을 만들 수 없는 사진이다");
    } finally {
      DECODING.release();
    }
    return out.toByteArray();
  }

  // AI 서버는 JPEG 만 받고 저장 키도 .jpg 라 PNG·WebP 는 들어올 때 JPEG 로 바꾼다
  public byte[] toJpeg(byte[] original) {
    DECODING.acquireUninterruptibly();
    try {
      return encode(onWhite(original));
    } catch (IOException e) {
      throw new BusinessException(ErrorCode.VALIDATION, "JPEG 로 바꿀 수 없는 사진이다");
    } finally {
      DECODING.release();
    }
  }

  // JPEG 에는 투명도가 없어 그대로 쓰면 투명한 곳이 검게 나오므로 흰 바탕에 얹는다.
  // 디코드한 원본은 이 메서드를 나가면 버려져, 인코딩하는 동안 장변 4096 버퍼가 하나만 남는다
  private static BufferedImage onWhite(byte[] original) throws IOException {
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
    return rgb;
  }

  private static byte[] encode(BufferedImage rgb) throws IOException {
    ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
    ImageWriteParam param = writer.getDefaultWriteParam();
    param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
    param.setCompressionQuality(JPEG_QUALITY);
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    try (ImageOutputStream stream = ImageIO.createImageOutputStream(out)) {
      writer.setOutput(stream);
      writer.write(null, new IIOImage(rgb, null, null), param);
    } finally {
      writer.dispose();
    }
    return out.toByteArray();
  }
}
