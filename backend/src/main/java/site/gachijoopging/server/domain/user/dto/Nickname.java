package site.gachijoopging.server.domain.user.dto;

public final class Nickname {

  private Nickname() {}

  public static String normalize(String nickname) {
    return nickname == null ? null : nickname.replace("\r", "").replace("\n", "").strip();
  }
}
