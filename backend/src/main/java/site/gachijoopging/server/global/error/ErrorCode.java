package site.gachijoopging.server.global.error;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
  TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED),
  INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED),
  FORBIDDEN(HttpStatus.FORBIDDEN),
  NO_CREW(HttpStatus.FORBIDDEN),
  EXPELLED_FROM_CREW(HttpStatus.FORBIDDEN),
  LEADER_MUST_DELEGATE(HttpStatus.FORBIDDEN),
  NOT_FOUND(HttpStatus.NOT_FOUND),
  METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED),
  CONFLICT(HttpStatus.CONFLICT),
  EMAIL_TAKEN(HttpStatus.CONFLICT),
  NICKNAME_TAKEN(HttpStatus.CONFLICT),
  CREW_NAME_TAKEN(HttpStatus.CONFLICT),
  ALREADY_IN_CREW(HttpStatus.CONFLICT),
  JOIN_REQUEST_PENDING(HttpStatus.CONFLICT),
  CREW_FULL(HttpStatus.CONFLICT),
  MEET_FULL(HttpStatus.CONFLICT),
  PAYLOAD_TOO_LARGE(HttpStatus.PAYLOAD_TOO_LARGE),
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
