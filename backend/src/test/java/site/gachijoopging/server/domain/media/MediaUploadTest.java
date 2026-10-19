package site.gachijoopging.server.domain.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import site.gachijoopging.server.support.IntegrationTest;
import site.gachijoopging.server.support.TestAccounts;

@AutoConfigureMockMvc
class MediaUploadTest extends IntegrationTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private JdbcTemplate jdbcTemplate;
  @Autowired private ObjectMapper objectMapper;

  @Value("${app.media.root}")
  private String 업로드_루트;

  @Test
  void 사진을_올리면_url_과_thumbUrl_이_돌아온다() throws Exception {
    String 토큰 = 가입하고_토큰을_받는다("media-ok@test.io");
    UUID mediaId = UUID.randomUUID();

    mockMvc
        .perform(업로드(토큰, mediaId, 사진()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.mediaId").value(mediaId.toString()))
        .andExpect(jsonPath("$.data.url").isNotEmpty())
        .andExpect(jsonPath("$.data.thumbUrl").isNotEmpty());
  }

  @Test
  void url_에는_서명과_만료가_붙는다() throws Exception {
    String 토큰 = 가입하고_토큰을_받는다("media-sign@test.io");

    JsonNode 응답 = 올린다(토큰, UUID.randomUUID());

    assertThat(응답.get("url").asText()).contains("?s=").contains("&e=");
    assertThat(응답.get("thumbUrl").asText()).contains("?s=").contains("&e=");
  }

  @Test
  void 원본과_썸네일이_디스크에_쓰인다() throws Exception {
    String 토큰 = 가입하고_토큰을_받는다("media-disk@test.io");
    UUID mediaId = UUID.randomUUID();

    올린다(토큰, mediaId);

    assertThat(업로드된_파일(mediaId, false)).exists();
    assertThat(업로드된_파일(mediaId, true)).exists();
  }

  @Test
  void 같은_mediaId_를_다시_보내도_행은_하나다() throws Exception {
    String 토큰 = 가입하고_토큰을_받는다("media-idem@test.io");
    UUID mediaId = UUID.randomUUID();

    올린다(토큰, mediaId);
    올린다(토큰, mediaId);

    Integer 행수 =
        jdbcTemplate.queryForObject(
            "SELECT count(*) FROM media WHERE id = ?", Integer.class, mediaId);
    assertThat(행수).isEqualTo(1);
  }

  @Test
  void 활동_사진이_아니면_photoId_와_inference_가_null_이다() throws Exception {
    String 토큰 = 가입하고_토큰을_받는다("media-post@test.io");

    mockMvc
        .perform(업로드(토큰, UUID.randomUUID(), 사진()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data.photoId").isEmpty())
        .andExpect(jsonPath("$.data.inference").isEmpty())
        .andExpect(jsonPath("$.data.url").isNotEmpty());
  }

  @Test
  void 토큰이_없으면_401_이다() throws Exception {
    mockMvc
        .perform(
            multipart("/api/v1/media")
                .file(new MockMultipartFile("file", "photo.jpg", "image/jpeg", 사진()))
                .param("mediaId", UUID.randomUUID().toString())
                .param("purpose", "POST"))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void 장변_4096을_넘으면_422_다() throws Exception {
    String 토큰 = 가입하고_토큰을_받는다("media-big@test.io");

    mockMvc
        .perform(업로드(토큰, UUID.randomUUID(), 사진(4097, 100)))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION"));
  }

  @Test
  void 남의_mediaId_를_보내면_403_이다() throws Exception {
    String 주인 = 가입하고_토큰을_받는다("media-owner@test.io");
    String 남 = 가입하고_토큰을_받는다("media-other@test.io");
    UUID mediaId = UUID.randomUUID();
    올린다(주인, mediaId);

    mockMvc
        .perform(업로드(남, mediaId, 사진()))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("FORBIDDEN"));
  }

  private JsonNode 올린다(String 토큰, UUID mediaId) throws Exception {
    String 본문 =
        mockMvc
            .perform(업로드(토큰, mediaId, 사진()))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return objectMapper.readTree(본문).get("data");
  }

  private static org.springframework.test.web.servlet.RequestBuilder 업로드(
      String 토큰, UUID mediaId, byte[] 파일) {
    return multipart("/api/v1/media")
        .file(new MockMultipartFile("file", "photo.jpg", "image/jpeg", 파일))
        .param("mediaId", mediaId.toString())
        .param("purpose", "POST")
        .header(HttpHeaders.AUTHORIZATION, "Bearer " + 토큰);
  }

  // 파일 이름은 {mediaId}-{시도}.jpg · {mediaId}-{시도}_thumb.jpg 다
  private Path 업로드된_파일(UUID mediaId, boolean 썸네일) throws IOException {
    try (var 경로들 = Files.walk(Path.of(업로드_루트))) {
      return 경로들.filter(
              it -> {
                String 이름 = it.getFileName().toString();
                return 이름.startsWith(mediaId + "-") && 이름.endsWith("_thumb.jpg") == 썸네일;
              })
          .findFirst()
          .orElse(Path.of(업로드_루트, "없음", mediaId + ".jpg"));
    }
  }

  private String 가입하고_토큰을_받는다(String 이메일) throws Exception {
    String 본문 =
        mockMvc
            .perform(
                post("/api/v1/auth/signup")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(TestAccounts.가입_본문(이메일)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return objectMapper.readTree(본문).get("data").get("accessToken").asText();
  }

  private static byte[] 사진() throws IOException {
    return 사진(800, 600);
  }

  private static byte[] 사진(int 너비, int 높이) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(너비, 높이, BufferedImage.TYPE_INT_RGB), "jpg", out);
    return out.toByteArray();
  }
}
