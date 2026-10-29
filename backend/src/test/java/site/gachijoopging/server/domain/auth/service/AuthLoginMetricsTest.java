package site.gachijoopging.server.domain.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import site.gachijoopging.server.domain.activity.service.ActivityService;
import site.gachijoopging.server.domain.auth.repository.RefreshTokenRepository;
import site.gachijoopging.server.domain.user.dto.UserAccount;
import site.gachijoopging.server.domain.user.service.UserService;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.lock.UserLock;
import site.gachijoopging.server.global.metrics.GachijoopgingMetrics;
import site.gachijoopging.server.global.security.jwt.JwtIssuer;

@ExtendWith(MockitoExtension.class)
class AuthLoginMetricsTest {

  private static final Instant 고정_시각 = Instant.parse("2026-08-05T04:00:00Z");

  @Mock private RefreshTokenRepository refreshTokenRepository;
  @Mock private RefreshTokenFamilyRevoker familyRevoker;
  @Mock private UserService userService;
  @Mock private JwtIssuer jwtIssuer;

  private SimpleMeterRegistry meterRegistry;
  private AuthService authService;

  @BeforeEach
  void setUp() {
    meterRegistry = new SimpleMeterRegistry();
    authService =
        new AuthService(
            refreshTokenRepository,
            familyRevoker,
            userService,
            mock(ActivityService.class),
            mock(UserLock.class),
            jwtIssuer,
            Clock.fixed(고정_시각, ZoneOffset.UTC),
            meterRegistry);
  }

  @Test
  void 두_카운터는_로그인_전에_이미_등록돼_있다() {
    assertThat(카운터(GachijoopgingMetrics.LOGIN_ATTEMPT)).isNotNull();
    assertThat(카운터(GachijoopgingMetrics.LOGIN_FAILURE)).isNotNull();
  }

  @Test
  void 로그인이_실패하면_시도와_실패를_함께_센다() {
    when(userService.authenticate("a@b.c", "틀린비밀번호")).thenReturn(Optional.empty());

    assertThatThrownBy(() -> authService.login("a@b.c", "틀린비밀번호"))
        .isInstanceOf(BusinessException.class);

    assertThat(카운터(GachijoopgingMetrics.LOGIN_ATTEMPT).count()).isEqualTo(1);
    assertThat(카운터(GachijoopgingMetrics.LOGIN_FAILURE).count()).isEqualTo(1);
  }

  @Test
  void 로그인이_성공하면_시도만_센다() {
    UUID userId = UUID.randomUUID();
    when(userService.authenticate("a@b.c", "맞는비밀번호"))
        .thenReturn(Optional.of(new UserAccount(userId, false, 0)));
    when(jwtIssuer.issue(userId)).thenReturn("access-token");
    when(refreshTokenRepository.save(any())).thenReturn(null);

    authService.login("a@b.c", "맞는비밀번호");

    assertThat(카운터(GachijoopgingMetrics.LOGIN_ATTEMPT).count()).isEqualTo(1);
    assertThat(카운터(GachijoopgingMetrics.LOGIN_FAILURE).count()).isZero();
  }

  private Counter 카운터(String 이름) {
    return meterRegistry.find(이름).counter();
  }
}
