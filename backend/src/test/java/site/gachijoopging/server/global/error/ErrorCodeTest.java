package site.gachijoopging.server.global.error;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ErrorCodeTest {

  @Test
  void 코드마다_02_컨벤션_6의_표와_같은_HTTP_상태를_가진다() {
    assertThat(ErrorCode.TOKEN_EXPIRED.status()).isEqualTo(HttpStatus.UNAUTHORIZED);
    assertThat(ErrorCode.INVALID_CREDENTIALS.status()).isEqualTo(HttpStatus.UNAUTHORIZED);
    assertThat(ErrorCode.FORBIDDEN.status()).isEqualTo(HttpStatus.FORBIDDEN);
    assertThat(ErrorCode.NO_CREW.status()).isEqualTo(HttpStatus.FORBIDDEN);
    assertThat(ErrorCode.EXPELLED_FROM_CREW.status()).isEqualTo(HttpStatus.FORBIDDEN);
    assertThat(ErrorCode.LEADER_MUST_DELEGATE.status()).isEqualTo(HttpStatus.FORBIDDEN);
    assertThat(ErrorCode.NOT_FOUND.status()).isEqualTo(HttpStatus.NOT_FOUND);
    assertThat(ErrorCode.METHOD_NOT_ALLOWED.status()).isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
    assertThat(ErrorCode.CONFLICT.status()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(ErrorCode.EMAIL_TAKEN.status()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(ErrorCode.NICKNAME_TAKEN.status()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(ErrorCode.CREW_NAME_TAKEN.status()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(ErrorCode.ALREADY_IN_CREW.status()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(ErrorCode.JOIN_REQUEST_PENDING.status()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(ErrorCode.CREW_FULL.status()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(ErrorCode.MEET_FULL.status()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(ErrorCode.VALIDATION.status()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    assertThat(ErrorCode.RATE_LIMITED.status()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    assertThat(ErrorCode.PAYLOAD_TOO_LARGE.status()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
    assertThat(ErrorCode.INTERNAL.status()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
  }

  @Test
  void 코드는_스무_종뿐이다() {
    assertThat(ErrorCode.values()).hasSize(20);
  }
}
