package site.gachijoopging.server.global.error;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
  TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED),
  INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED),
  FORBIDDEN(HttpStatus.FORBIDDEN),
  ACCOUNT_SUSPENDED(HttpStatus.FORBIDDEN),
  NOT_FOUND(HttpStatus.NOT_FOUND),
  METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED),
  CONFLICT(HttpStatus.CONFLICT),
  NICKNAME_TAKEN(HttpStatus.CONFLICT),
  MEET_FULL(HttpStatus.CONFLICT),
  VALIDATION(HttpStatus.UNPROCESSABLE_ENTITY),
  RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS),
  INTERNAL(HttpStatus.INTERNAL_SERVER_ERROR);

  private final HttpStatus status;

  ErrorCode(HttpStatus status) {
    this.status = status;
  }

  public HttpStatus status() {
    return status;
  }
}
