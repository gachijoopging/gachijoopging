package site.gachijoopging.server.global.error;

import java.util.List;

public class BusinessException extends RuntimeException {

  private final ErrorCode errorCode;
  private final Long retryAfterSeconds;
  private final List<ErrorField> fields;

  public BusinessException(ErrorCode errorCode, String message) {
    this(errorCode, message, null, null);
  }

  public BusinessException(ErrorCode errorCode, String message, Long retryAfterSeconds) {
    this(errorCode, message, retryAfterSeconds, null);
  }

  public BusinessException(ErrorCode errorCode, String message, List<ErrorField> fields) {
    this(errorCode, message, null, fields);
  }

  private BusinessException(
      ErrorCode errorCode, String message, Long retryAfterSeconds, List<ErrorField> fields) {
    super(message);
    this.errorCode = errorCode;
    this.retryAfterSeconds = retryAfterSeconds;
    this.fields = fields;
  }

  public ErrorCode errorCode() {
    return errorCode;
  }

  public Long retryAfterSeconds() {
    return retryAfterSeconds;
  }

  public List<ErrorField> fields() {
    return fields;
  }
}
