package site.gachijoopging.server.domain.crew.service;

import java.security.SecureRandom;
import java.util.Locale;

public final class InviteCodes {

  public static final String PATTERN = "^[A-Za-z0-9]{2}-?[A-Za-z0-9]{4}$";

  // 손으로 옮겨 적는 코드라 헷갈리는 0·O·1·I 는 발급하지 않는다
  private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  private static final SecureRandom RANDOM = new SecureRandom();

  private InviteCodes() {}

  public static String issue() {
    StringBuilder code = new StringBuilder(7);
    for (int i = 0; i < 6; i++) {
      if (i == 2) {
        code.append('-');
      }
      code.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
    }
    return code.toString();
  }

  public static String canonical(String input) {
    String compact = input.replace("-", "").toUpperCase(Locale.ROOT);
    return compact.substring(0, 2) + "-" + compact.substring(2);
  }
}
