package site.gachijoopging.server.global.error;

public class BusinessException extends RuntimeException {

  private final ErrorCode errorCode;
  private final Long retryAfterSeconds;

  public BusinessException(ErrorCode errorCode, String message) {
    this(errorCode, message, null);
  }

  public BusinessException(ErrorCode errorCode, String message, Long retryAfterSeconds) {
    super(message);
    this.errorCode = errorCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  public ErrorCode errorCode() {
    return errorCode;
  }

  public Long retryAfterSeconds() {
    return retryAfterSeconds;
  }
}
