package site.gachijoopging.server.domain.user.controller;

import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.domain.user.dto.AgreementCatalogResponse;
import site.gachijoopging.server.domain.user.dto.AgreementsResponse;
import site.gachijoopging.server.domain.user.dto.AgreementsUpdateRequest;
import site.gachijoopging.server.domain.user.service.AgreementService;
import site.gachijoopging.server.global.response.ApiResponse;
import site.gachijoopging.server.global.security.CurrentUser;

@RestController
@RequiredArgsConstructor
public class AgreementController {

  private final AgreementService agreementService;

  @GetMapping("/agreements")
  public ApiResponse<AgreementCatalogResponse> catalog() {
    return ApiResponse.of(agreementService.getCatalog());
  }

  @GetMapping("/users/me/agreements")
  public ApiResponse<AgreementsResponse> get(@CurrentUser UUID me) {
    return ApiResponse.of(agreementService.get(me));
  }

  @PutMapping("/users/me/agreements")
  public ApiResponse<AgreementsResponse> update(
      @CurrentUser UUID me, @Valid @RequestBody AgreementsUpdateRequest request) {
    return ApiResponse.of(agreementService.update(me, request));
  }
}
