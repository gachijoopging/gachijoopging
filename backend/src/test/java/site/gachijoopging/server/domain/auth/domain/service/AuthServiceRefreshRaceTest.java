package site.gachijoopging.server.domain.auth.domain.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import site.gachijoopging.server.domain.auth.domain.entity.RefreshToken;
import site.gachijoopging.server.domain.auth.infrastructure.persistence.DailyActiveUserRepository;
import site.gachijoopging.server.domain.auth.infrastructure.persistence.RefreshTokenRepository;
import site.gachijoopging.server.domain.user.domain.service.UserService;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.security.jwt.JwtIssuer;

class AuthServiceRefreshRaceTest {

  private static final Instant 지금 = Instant.parse("2026-08-05T00:00:00Z");
  private static final String 원문 = "raw-refresh-token";

  private final RefreshTokenRepository refreshTokenRepository = mock(RefreshTokenRepository.class);
  private final RefreshTokenFamilyRevoker familyRevoker = mock(RefreshTokenFamilyRevoker.class);
  private final JwtIssuer jwtIssuer = mock(JwtIssuer.class);

  private final AuthService authService =
      new AuthService(
          refreshTokenRepository,
          mock(DailyActiveUserRepository.class),
          familyRevoker,
          mock(UserService.class),
          jwtIssuer,
          Clock.fixed(지금, ZoneOffset.UTC),
          new SimpleMeterRegistry());

  @Test
  void 회전을_먼저_뺏긴_요청은_새_토큰을_받지_못한다() {
    살아있는_토큰을_읽는다();
    given(refreshTokenRepository.revokeIfActive(anyString(), any())).willReturn(0);

    assertThatThrownBy(() -> authService.refresh(원문)).isInstanceOf(BusinessException.class);

    verify(jwtIssuer, never()).issue(any());
  }

  private void 살아있는_토큰을_읽는다() {
    RefreshToken 살아있음 =
        RefreshToken.builder()
            .userId(UUID.randomUUID())
            .tokenHash("hash")
            .familyId(UUID.randomUUID())
            .expiresAt(지금.plusSeconds(3600))
            .now(지금)
            .build();
    given(refreshTokenRepository.findByTokenHash(any())).willReturn(Optional.of(살아있음));
  }
}
