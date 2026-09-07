package site.gachijoopging.server.global.response;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

public final class Cursors {

  private Cursors() {}

  public record Cursor(Instant createdAt, UUID id) {}

  public record LongCursor(Instant createdAt, long id) {}

  public static String encode(Instant createdAt, UUID id) {
    return encodeRaw(createdAt, id.toString());
  }

  public static String encode(Instant createdAt, long id) {
    return encodeRaw(createdAt, Long.toString(id));
  }

  public static Cursor decode(String cursor) {
    String[] parts = split(cursor);
    try {
      return new Cursor(epochMicro(parts[0]), UUID.fromString(parts[1]));
    } catch (IllegalArgumentException e) {
      throw invalidCursor();
    }
  }

  public static LongCursor decodeLong(String cursor) {
    String[] parts = split(cursor);
    try {
      return new LongCursor(epochMicro(parts[0]), Long.parseLong(parts[1]));
    } catch (IllegalArgumentException e) {
      throw invalidCursor();
    }
  }

  private static String encodeRaw(Instant createdAt, String id) {
    String raw = micros(createdAt) + ":" + id;
    return Base64.getUrlEncoder()
        .withoutPadding()
        .encodeToString(raw.getBytes(StandardCharsets.UTF_8));
  }

  private static String[] split(String cursor) {
    String raw = decodeBase64Url(cursor);
    int separator = raw.indexOf(':');
    if (separator < 0) {
      throw invalidCursor();
    }
    return new String[] {raw.substring(0, separator), raw.substring(separator + 1)};
  }

  private static long micros(Instant createdAt) {
    return createdAt.getEpochSecond() * 1_000_000L + createdAt.getNano() / 1_000;
  }

  private static Instant epochMicro(String raw) {
    long micros = Long.parseLong(raw);
    return Instant.ofEpochSecond(
        Math.floorDiv(micros, 1_000_000L), Math.floorMod(micros, 1_000_000L) * 1_000);
  }

  private static String decodeBase64Url(String cursor) {
    try {
      return new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
    } catch (IllegalArgumentException e) {
      throw invalidCursor();
    }
  }

  private static BusinessException invalidCursor() {
    return new BusinessException(ErrorCode.VALIDATION, "cursor 형식이 올바르지 않다");
  }
}
