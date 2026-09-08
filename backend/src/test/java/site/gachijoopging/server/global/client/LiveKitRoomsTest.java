package site.gachijoopging.server.global.client;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class LiveKitRoomsTest {

  @Test
  void 만든_이름을_되읽으면_같은_모임_id_다() {
    UUID meetId = UUID.fromString("0198e2ac-6b1f-7c3d-9a2e-5f8b1c4d7e60");

    String room = LiveKitRooms.ofMeet(meetId);

    assertThat(room).isEqualTo("meet-0198e2ac-6b1f-7c3d-9a2e-5f8b1c4d7e60");
    assertThat(LiveKitRooms.meetIdOf(room)).contains(meetId.toString());
  }

  @Test
  void 접두사가_없거나_뒤가_비면_모임이_아니다() {
    assertThat(LiveKitRooms.meetIdOf("lobby")).isEmpty();
    assertThat(LiveKitRooms.meetIdOf("meet-")).isEmpty();
    assertThat(LiveKitRooms.meetIdOf("")).isEmpty();
    assertThat(LiveKitRooms.meetIdOf(null)).isEmpty();
  }
}
