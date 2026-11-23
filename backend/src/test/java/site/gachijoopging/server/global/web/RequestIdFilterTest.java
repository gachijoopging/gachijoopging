package site.gachijoopging.server.global.web;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import java.io.IOException;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestIdFilterTest {

  private final RequestIdFilter filter = new RequestIdFilter();

  @Test
  void 필터를_지나는_동안_MDC_에_requestId_가_있다() throws ServletException, IOException {
    String[] 체인이_본_값 = new String[1];
    FilterChain chain = (request, response) -> 체인이_본_값[0] = MDC.get(RequestIdFilter.REQUEST_ID);

    filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), chain);

    assertThat(체인이_본_값[0]).isNotBlank();
  }

  @Test
  void 필터를_빠져나오면_MDC_가_비워진다() throws ServletException, IOException {
    filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), (q, s) -> {});

    assertThat(MDC.get(RequestIdFilter.REQUEST_ID)).isNull();
  }

  @Test
  void 체인이_예외를_던져도_MDC_가_비워진다() {
    FilterChain 터지는_체인 =
        (request, response) -> {
          throw new IllegalStateException("boom");
        };

    try {
      filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), 터지는_체인);
    } catch (Exception ignored) {
    }

    assertThat(MDC.get(RequestIdFilter.REQUEST_ID)).isNull();
  }

  @Test
  void 요청마다_다른_requestId_를_만든다() throws ServletException, IOException {
    String[] 첫번째 = new String[1];
    String[] 두번째 = new String[1];

    filter.doFilter(
        new MockHttpServletRequest(),
        new MockHttpServletResponse(),
        (q, s) -> 첫번째[0] = MDC.get(RequestIdFilter.REQUEST_ID));
    filter.doFilter(
        new MockHttpServletRequest(),
        new MockHttpServletResponse(),
        (q, s) -> 두번째[0] = MDC.get(RequestIdFilter.REQUEST_ID));

    assertThat(첫번째[0]).isNotEqualTo(두번째[0]);
  }
}
