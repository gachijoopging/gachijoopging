package site.gachijoopging.server.global.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.slf4j.MDC;
import org.springframework.http.MediaType;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.error.ErrorResponse;
import site.gachijoopging.server.global.web.RequestIdFilter;

final class SecurityErrorWriter {

  private SecurityErrorWriter() {}

  static void write(
      HttpServletResponse response, ObjectMapper objectMapper, ErrorCode errorCode, String message)
      throws IOException {
    ErrorResponse body =
        new ErrorResponse(errorCode.name(), message, MDC.get(RequestIdFilter.REQUEST_ID));

    response.setStatus(errorCode.status().value());
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    response.setCharacterEncoding(StandardCharsets.UTF_8.name());
    response.getWriter().write(objectMapper.writeValueAsString(body));
  }
}
