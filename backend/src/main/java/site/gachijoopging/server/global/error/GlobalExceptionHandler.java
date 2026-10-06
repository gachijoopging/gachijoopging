package site.gachijoopging.server.global.error;

import jakarta.validation.ConstraintViolationException;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import site.gachijoopging.server.global.web.RequestIdFilter;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

  private static final String INTERNAL_MESSAGE = "서버 오류가 발생했다";

  @ExceptionHandler(BusinessException.class)
  public ResponseEntity<ErrorResponse> handleBusiness(BusinessException e) {
    log.warn("{} {}", e.errorCode(), e.getMessage());
    return toResponse(e.errorCode(), e.getMessage(), e.retryAfterSeconds(), e.fields());
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<ErrorResponse> handleNotValid(MethodArgumentNotValidException e) {
    String message =
        e.getBindingResult().getFieldErrors().stream()
            .findFirst()
            .map(GlobalExceptionHandler::describe)
            .orElse("요청 값이 올바르지 않다");
    log.warn("{} {}", ErrorCode.VALIDATION, message);
    return toResponse(ErrorCode.VALIDATION, message);
  }

  @ExceptionHandler(HttpMessageNotReadableException.class)
  public ResponseEntity<ErrorResponse> handleNotReadable(HttpMessageNotReadableException e) {
    log.warn("{} {}", ErrorCode.VALIDATION, e.getMessage());
    return toResponse(ErrorCode.VALIDATION, "요청 본문을 읽을 수 없다");
  }

  @ExceptionHandler({HandlerMethodValidationException.class, ConstraintViolationException.class})
  public ResponseEntity<ErrorResponse> handleParameterNotValid(Exception e) {
    log.warn("{} {}", ErrorCode.VALIDATION, e.getMessage());
    return toResponse(ErrorCode.VALIDATION, "요청 파라미터가 올바르지 않다");
  }

  @ExceptionHandler(MissingServletRequestParameterException.class)
  public ResponseEntity<ErrorResponse> handleMissingParameter(
      MissingServletRequestParameterException e) {
    log.warn("{} {} 누락", ErrorCode.VALIDATION, e.getParameterName());
    return toResponse(ErrorCode.VALIDATION, e.getParameterName() + " 는 필수다");
  }

  @ExceptionHandler(MethodArgumentTypeMismatchException.class)
  public ResponseEntity<ErrorResponse> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
    log.warn("{} {} 바인딩 실패", ErrorCode.VALIDATION, e.getName());
    return toResponse(ErrorCode.VALIDATION, e.getName() + " 값이 올바르지 않다");
  }

  @ExceptionHandler(NoResourceFoundException.class)
  public ResponseEntity<ErrorResponse> handleNoResource(NoResourceFoundException e) {
    log.warn("{} {}", ErrorCode.NOT_FOUND, e.getResourcePath());
    return toResponse(ErrorCode.NOT_FOUND, "그런 경로가 없다");
  }

  @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
  public ResponseEntity<ErrorResponse> handleMethodNotSupported(
      HttpRequestMethodNotSupportedException e) {
    log.warn("{} {}", ErrorCode.METHOD_NOT_ALLOWED, e.getMethod());
    return toResponse(ErrorCode.METHOD_NOT_ALLOWED, "허용되지 않은 메서드다");
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  public ResponseEntity<ErrorResponse> handleIntegrityViolation(DataIntegrityViolationException e) {
    log.warn("{} 무결성 위반", ErrorCode.CONFLICT, e);
    return toResponse(ErrorCode.CONFLICT, "요청이 현재 상태와 충돌한다");
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ErrorResponse> handleUnexpected(Exception e) {
    log.error("미처리 예외", e);
    return toResponse(ErrorCode.INTERNAL, INTERNAL_MESSAGE);
  }

  private static String describe(FieldError error) {
    return error.getField() + " " + error.getDefaultMessage();
  }

  private static ResponseEntity<ErrorResponse> toResponse(ErrorCode errorCode, String message) {
    return toResponse(errorCode, message, null, null);
  }

  private static ResponseEntity<ErrorResponse> toResponse(
      ErrorCode errorCode, String message, Long retryAfterSeconds, List<ErrorField> fields) {
    ErrorResponse body =
        new ErrorResponse(errorCode.name(), message, MDC.get(RequestIdFilter.REQUEST_ID), fields);
    ResponseEntity.BodyBuilder builder = ResponseEntity.status(errorCode.status());
    if (retryAfterSeconds != null) {
      builder.header(HttpHeaders.RETRY_AFTER, String.valueOf(retryAfterSeconds));
    }
    return builder.body(body);
  }
}
