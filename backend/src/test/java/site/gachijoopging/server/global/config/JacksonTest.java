package site.gachijoopging.server.global.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.json.JsonTest;

@JsonTest
class JacksonTest {

  @Autowired private ObjectMapper objectMapper;

  record 시각과_빈값을_담은_응답(Instant at, String 없을_수_있는_값) {}

  private static final 시각과_빈값을_담은_응답 응답 =
      new 시각과_빈값을_담은_응답(Instant.ofEpochMilli(1_700_000_000_000L), null);

  @Test
  void Instant_는_ISO_8601_Z_문자열로_나간다() throws JsonProcessingException {
    assertThat(objectMapper.writeValueAsString(응답)).contains("\"at\":\"2023-11-14T22:13:20Z\"");
  }

  @Test
  void null_필드의_키는_사라지지_않는다() throws JsonProcessingException {
    assertThat(objectMapper.writeValueAsString(응답)).contains("\"없을_수_있는_값\":null");
  }
}
