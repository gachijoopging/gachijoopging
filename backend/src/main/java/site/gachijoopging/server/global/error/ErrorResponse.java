package site.gachijoopging.server.global.error;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

// fields 는 VALIDATION 422 에서 화면이 입력 아래 오류를 붙일 때만 쓴다 — 다른 코드에서는 생략한다
public record ErrorResponse(
    String code,
    String message,
    String requestId,
    @JsonInclude(JsonInclude.Include.NON_NULL) List<ErrorField> fields) {

  public ErrorResponse(String code, String message, String requestId) {
    this(code, message, requestId, null);
  }
}
