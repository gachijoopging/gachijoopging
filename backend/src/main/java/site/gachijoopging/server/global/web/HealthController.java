package site.gachijoopging.server.global.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.global.response.ApiResponse;

@RestController
public class HealthController {

  @GetMapping("/health")
  public ApiResponse<HealthResponse> health() {
    return ApiResponse.of(HealthResponse.UP);
  }
}
