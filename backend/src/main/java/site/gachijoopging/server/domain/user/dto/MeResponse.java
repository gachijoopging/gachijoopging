package site.gachijoopging.server.domain.user.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public record MeResponse(
    String id,
    boolean profileComplete,
    @Schema(nullable = true) String nickname,
    String intro,
    @Schema(nullable = true) String photoUrl,
    @Schema(nullable = true) String email,
    boolean hasPassword,
    Linked linked,
    Settings settings,
    Membership membership) {

  public record Linked(boolean kakao, boolean google) {}

  public record Settings(boolean shareLocationDefault, boolean notifyActivityStart) {}

  public record Membership(MembershipStatus status, @Schema(nullable = true) MembershipCrew crew) {}

  public enum MembershipStatus {
    NONE,
    PENDING,
    MEMBER
  }

  public record MembershipCrew(String id, String name, boolean isLeader) {}
}
