package site.gachijoopging.server.domain.media.client;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class ThumbnailerTest {

  private final Thumbnailer thumbnailer = new Thumbnailer();

  @Test
  void 장변을_512로_줄인다() throws IOException {
    byte[] 원본 = jpeg(2048, 1024);

    BufferedImage 썸네일 = 읽는다(thumbnailer.of(원본));

    assertThat(썸네일.getWidth()).isEqualTo(512);
    assertThat(썸네일.getHeight()).isEqualTo(256);
  }

  @Test
  void 세로로_찍은_사진의_썸네일이_눕지_않는다() throws IOException {
    byte[] 원본 = exif_회전을_붙인다(jpeg(1024, 512), (byte) 6);

    BufferedImage 썸네일 = 읽는다(thumbnailer.of(원본));

    assertThat(썸네일.getHeight()).isGreaterThan(썸네일.getWidth());
  }

  @Test
  void 결과는_JPEG_다() throws IOException {
    byte[] 썸네일 = thumbnailer.of(jpeg(1024, 512));

    assertThat(썸네일[0]).isEqualTo((byte) 0xFF);
    assertThat(썸네일[1]).isEqualTo((byte) 0xD8);
  }

  @Test
  void 투명한_PNG_는_흰_바탕의_JPEG_로_바뀐다() throws IOException {
    BufferedImage 투명 = new BufferedImage(40, 20, BufferedImage.TYPE_INT_ARGB);
    ByteArrayOutputStream png = new ByteArrayOutputStream();
    ImageIO.write(투명, "png", png);

    byte[] 결과 = thumbnailer.toJpeg(png.toByteArray());

    assertThat(결과[0]).isEqualTo((byte) 0xFF);
    assertThat(결과[1]).isEqualTo((byte) 0xD8);
    BufferedImage 읽은_것 = 읽는다(결과);
    assertThat(읽은_것.getWidth()).isEqualTo(40);
    assertThat(new Color(읽은_것.getRGB(10, 10)).getRed()).isGreaterThan(240);
  }

  private static BufferedImage 읽는다(byte[] jpeg) throws IOException {
    return ImageIO.read(new ByteArrayInputStream(jpeg));
  }

  private static byte[] jpeg(int 너비, int 높이) throws IOException {
    BufferedImage image = new BufferedImage(너비, 높이, BufferedImage.TYPE_INT_RGB);
    Graphics2D g = image.createGraphics();
    g.setColor(Color.GRAY);
    g.fillRect(0, 0, 너비, 높이);
    g.dispose();

    ByteArrayOutputStream out = new ByteArrayOutputStream();
    ImageIO.write(image, "jpg", out);
    return out.toByteArray();
  }

  private static byte[] exif_회전을_붙인다(byte[] jpeg, byte orientation) {
    byte[] app1 = {
      (byte) 0xFF,
      (byte) 0xE1,
      0x00,
      0x22,
      0x45,
      0x78,
      0x69,
      0x66,
      0x00,
      0x00,
      0x4D,
      0x4D,
      0x00,
      0x2A,
      0x00,
      0x00,
      0x00,
      0x08,
      0x00,
      0x01,
      0x01,
      0x12,
      0x00,
      0x03,
      0x00,
      0x00,
      0x00,
      0x01,
      0x00,
      orientation,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00
    };

    byte[] 결과 = new byte[jpeg.length + app1.length];
    System.arraycopy(jpeg, 0, 결과, 0, 2);
    System.arraycopy(app1, 0, 결과, 2, app1.length);
    System.arraycopy(jpeg, 2, 결과, 2 + app1.length, jpeg.length - 2);
    return 결과;
  }
}
