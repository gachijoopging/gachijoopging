package site.gachijoopging.server.domain.media.controller;

import java.io.IOException;
import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import site.gachijoopging.server.domain.media.dto.MediaDtos.MediaUploadResponse;
import site.gachijoopging.server.domain.media.dto.MediaPurpose;
import site.gachijoopging.server.domain.media.dto.MediaUpload;
import site.gachijoopging.server.domain.media.facade.MediaFacade;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.response.ApiResponse;
import site.gachijoopging.server.global.security.CurrentUser;

@RestController
@RequiredArgsConstructor
@RequestMapping("/media")
public class MediaController {

  private final MediaFacade mediaFacade;

  @PostMapping
  public ApiResponse<MediaUploadResponse> upload(
      @CurrentUser UUID me,
      @RequestParam("mediaId") UUID mediaId,
      @RequestParam("file") MultipartFile file,
      @RequestParam("purpose") MediaPurpose purpose,
      @RequestParam(value = "activityId", required = false) UUID activityId,
      @RequestParam(value = "takenAt", required = false)
          @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
          Instant takenAt,
      @RequestParam(value = "lat", required = false) Double lat,
      @RequestParam(value = "lng", required = false) Double lng) {
    return ApiResponse.of(
        mediaFacade.upload(
            me, new MediaUpload(mediaId, toBytes(file), purpose, activityId, takenAt, lat, lng)));
  }

  @DeleteMapping("/{mediaId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@CurrentUser UUID me, @PathVariable UUID mediaId) {
    mediaFacade.delete(me, mediaId);
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
