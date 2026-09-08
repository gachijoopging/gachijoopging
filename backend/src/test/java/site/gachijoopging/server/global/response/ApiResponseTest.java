package site.gachijoopging.server.global.response;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class ApiResponseTest {

  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void 성공_응답은_data_봉투로_직렬화된다() throws JsonProcessingException {
    String json = objectMapper.writeValueAsString(ApiResponse.of("ok"));

    assertThat(json).isEqualTo("{\"data\":\"ok\"}");
  }

  @Test
  void 배열도_data_에_그대로_담긴다() throws JsonProcessingException {
    String json = objectMapper.writeValueAsString(ApiResponse.of(List.of("a", "b")));

    assertThat(json).isEqualTo("{\"data\":[\"a\",\"b\"]}");
  }

  @Test
  void 목록_페이지는_items_와_nextCursor_로_직렬화된다() throws JsonProcessingException {
    String json = objectMapper.writeValueAsString(new CursorPage<>(List.of("a"), "Y3Vyc29y"));

    assertThat(json).isEqualTo("{\"items\":[\"a\"],\"nextCursor\":\"Y3Vyc29y\"}");
  }

  @Test
  void 마지막_페이지의_nextCursor_는_null_이다() throws JsonProcessingException {
    String json = objectMapper.writeValueAsString(new CursorPage<>(List.of("a"), null));

    assertThat(json).isEqualTo("{\"items\":[\"a\"],\"nextCursor\":null}");
  }
}
