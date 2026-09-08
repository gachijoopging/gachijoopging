package site.gachijoopging.server.domain.auth.domain.service;

import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.auth.infrastructure.persistence.RefreshTokenRepository;

@Component
@RequiredArgsConstructor
public class RefreshTokenFamilyRevoker {

  private final RefreshTokenRepository refreshTokenRepository;

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void revokeFamily(UUID familyId, Instant now) {
    refreshTokenRepository.revokeFamily(familyId, now);
  }
}
