package site.gachijoopging.server.domain.crew.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Objects;
import java.util.UUID;

public record UserBriefResponse(
    String id, String nickname, @Schema(nullable = true) String photoUrl, boolean withdrawn) {

  public static final String WITHDRAWN_NICKNAME = "탈퇴한 크루원";

  // 탈퇴한 사람은 이름·사진 없이 보인다 (ERD 회원 탈퇴 때)
  public static UserBriefResponse of(UUID id, String status, String nickname, String photoUrl) {
    if ("DELETED".equals(status)) {
      return new UserBriefResponse(id.toString(), WITHDRAWN_NICKNAME, null, true);
    }
    return new UserBriefResponse(
        id.toString(), Objects.requireNonNullElse(nickname, ""), photoUrl, false);
  }
}
