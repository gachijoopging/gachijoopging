package site.gachijoopging.server.global.error;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import site.gachijoopging.server.global.config.WebConfig;
import site.gachijoopging.server.global.security.AccountAuthorityLoader;
import site.gachijoopging.server.global.security.SecurityConfig;
import site.gachijoopging.server.global.security.jwt.JwtVerifier;
import site.gachijoopging.server.global.web.RequestIdFilter;

@WebMvcTest(controllers = GlobalExceptionHandlerTest.예외를_던지는_컨트롤러.class)
@Import({
  WebConfig.class,
  SecurityConfig.class,
  GlobalExceptionHandler.class,
  RequestIdFilter.class,
  GlobalExceptionHandlerTest.예외를_던지는_컨트롤러.class
})
@WithMockUser
class GlobalExceptionHandlerTest {

  @MockitoBean private JwtVerifier jwtVerifier;

  @MockitoBean private AccountAuthorityLoader accountAuthorityLoader;

  @Autowired private MockMvc mockMvc;

  @Test
  void BusinessException_은_ErrorCode_의_HTTP_상태와_code_로_나간다() throws Exception {
    mockMvc
        .perform(get("/api/v1/test/not-found"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("NOT_FOUND"))
        .andExpect(jsonPath("$.message").value("activity 42"));
  }

  @Test
  void 에러_봉투에는_래퍼가_없다() throws Exception {
    mockMvc
        .perform(get("/api/v1/test/not-found"))
        .andExpect(jsonPath("$.data").doesNotExist())
        .andExpect(jsonPath("$.error").doesNotExist());
  }

  @Test
  void 에러_봉투에는_로그와_이어지는_requestId_가_실린다() throws Exception {
    mockMvc.perform(get("/api/v1/test/not-found")).andExpect(jsonPath("$.requestId").isNotEmpty());
  }

  @Test
  void Bean_Validation_실패는_422_VALIDATION_이다() throws Exception {
    mockMvc
        .perform(
            post("/api/v1/test/validated")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"\"}"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("VALIDATION"));
  }

  @Test
  void 미처리_예외는_500_INTERNAL_이다() throws Exception {
    mockMvc
        .perform(get("/api/v1/test/boom"))
        .andExpect(status().isInternalServerError())
        .andExpect(jsonPath("$.code").value("INTERNAL"));
  }

  @Test
  void 미처리_예외의_message_는_밖으로_새지_않는다() throws Exception {
    mockMvc
        .perform(get("/api/v1/test/boom"))
        .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.not("데이터베이스 비밀번호가 틀렸다")));
  }

  @Test
  void 없는_경로는_404_NOT_FOUND_다() throws Exception {
    mockMvc
        .perform(get("/api/v1/test/그런-경로는-없다"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("NOT_FOUND"));
  }

  @Test
  void 허용되지_않은_메서드는_405_METHOD_NOT_ALLOWED_다() throws Exception {
    mockMvc
        .perform(post("/api/v1/test/not-found"))
        .andExpect(status().isMethodNotAllowed())
        .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"));
  }

  @Test
  void 재시도_시각을_아는_예외는_Retry_After_를_함께_보낸다() throws Exception {
    mockMvc
        .perform(get("/api/v1/test/rate-limited"))
        .andExpect(status().isTooManyRequests())
        .andExpect(jsonPath("$.code").value("RATE_LIMITED"))
        .andExpect(header().string("Retry-After", "600"));
  }

  @Test
  void 재시도_시각을_모르면_Retry_After_를_붙이지_않는다() throws Exception {
    mockMvc.perform(get("/api/v1/test/not-found")).andExpect(header().doesNotExist("Retry-After"));
  }

  @Test
  void 무결성_위반은_409_CONFLICT_이고_제약_이름을_흘리지_않는다() throws Exception {
    mockMvc
        .perform(get("/api/v1/test/integrity"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONFLICT"))
        .andExpect(jsonPath("$.message").value("요청이 현재 상태와 충돌한다"));
  }

  @RestController
  static class 예외를_던지는_컨트롤러 {

    @GetMapping("/test/not-found")
    void notFound() {
      throw new BusinessException(ErrorCode.NOT_FOUND, "activity 42");
    }

    @GetMapping("/test/boom")
    void boom() {
      throw new IllegalStateException("데이터베이스 비밀번호가 틀렸다");
    }

    @GetMapping("/test/rate-limited")
    void rateLimited() {
      throw new BusinessException(ErrorCode.RATE_LIMITED, "일일 한도", 600L);
    }

    @GetMapping("/test/integrity")
    void integrity() {
      throw new DataIntegrityViolationException(
          "could not execute statement [ERROR: duplicate key value violates unique constraint"
              + " \"uk_meet_members\"]");
    }

    @PostMapping("/test/validated")
    void validated(@Valid @RequestBody 이름_요청 request) {}
  }

  record 이름_요청(@NotBlank String name) {}
}
