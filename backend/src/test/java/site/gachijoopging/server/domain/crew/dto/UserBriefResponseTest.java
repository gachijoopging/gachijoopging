package site.gachijoopging.server.domain.crew.dto;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class UserBriefResponseTest {

  private static final UUID ID = UUID.fromString("0f3b2c1a-7d4e-4c8b-9a1f-2e5d6c7b8a90");

  @Test
  void 탈퇴한_사람은_이름과_사진_없이_탈퇴한_크루원이다() {
    UserBriefResponse brief =
        UserBriefResponse.of(ID, "DELETED", "줍깅러", "https://media.test/a.jpg");

    assertThat(brief).isEqualTo(new UserBriefResponse(ID.toString(), "탈퇴한 크루원", null, true));
  }

  @Test
  void 활성_사용자는_닉네임과_사진을_그대로_보이고_닉네임이_없으면_빈_문자열이다() {
    assertThat(UserBriefResponse.of(ID, "ACTIVE", "줍깅러", "https://media.test/a.jpg"))
        .isEqualTo(new UserBriefResponse(ID.toString(), "줍깅러", "https://media.test/a.jpg", false));
    assertThat(UserBriefResponse.of(ID, "ACTIVE", null, null))
        .isEqualTo(new UserBriefResponse(ID.toString(), "", null, false));
  }
}
