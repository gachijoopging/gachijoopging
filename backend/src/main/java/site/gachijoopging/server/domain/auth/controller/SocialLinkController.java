package site.gachijoopging.server.domain.auth.controller;

import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.domain.auth.dto.AuthDtos.SocialLinkRequest;
import site.gachijoopging.server.domain.auth.facade.AuthFacade;
import site.gachijoopging.server.global.security.CurrentUser;

@RestController
@RequiredArgsConstructor
public class SocialLinkController {

  private final AuthFacade authFacade;

  @PutMapping("/users/me/social")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void link(@CurrentUser UUID me, @Valid @RequestBody SocialLinkRequest request) {
    authFacade.linkSocial(me, request.provider(), request.token());
  }
}
