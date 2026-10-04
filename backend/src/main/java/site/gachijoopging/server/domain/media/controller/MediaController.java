package site.gachijoopging.server.domain.media.controller;

import java.io.IOException;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import site.gachijoopging.server.domain.media.dto.MediaDtos.MediaUploadResponse;
import site.gachijoopging.server.domain.media.facade.MediaCommandService;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.response.ApiResponse;
import site.gachijoopging.server.global.security.CurrentUser;

@RestController
@RequiredArgsConstructor
@RequestMapping("/media")
public class MediaController {

  private final MediaCommandService mediaCommandService;

  @PostMapping
  public ApiResponse<MediaUploadResponse> upload(
      @CurrentUser UUID me,
      @RequestParam("mediaId") UUID mediaId,
      @RequestParam("file") MultipartFile file) {
    return ApiResponse.of(mediaCommandService.upload(me, mediaId, toBytes(file)));
  }

  private static byte[] toBytes(MultipartFile file) {
    if (file.isEmpty()) {
      throw new BusinessException(ErrorCode.VALIDATION, "file 이 비어 있다");
    }
    try {
      return file.getBytes();
    } catch (IOException e) {
      throw new BusinessException(ErrorCode.VALIDATION, "업로드된 파일을 읽을 수 없다");
    }
  }
}
