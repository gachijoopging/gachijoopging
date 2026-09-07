package site.gachijoopging.server.global.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.filter.OncePerRequestFilter;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;
import site.gachijoopging.server.global.security.jwt.JwtVerifier;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

  private static final String BEARER = "Bearer ";

  private static final AntPathMatcher PATHS = new AntPathMatcher();

  private final JwtVerifier verifier;
  private final AccountAuthorityLoader authorityLoader;
  private final ObjectMapper objectMapper;

  @Override
  protected boolean shouldNotFilterAsyncDispatch() {
    return false;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String token = bearerToken(request);
    if (token != null && !authenticate(request, response, token)) {
      return;
    }
    chain.doFilter(request, response);
  }

  private boolean authenticate(
      HttpServletRequest request, HttpServletResponse response, String token) throws IOException {
    try {
      UUID userId = verifier.verify(token);
      var authentication =
          new UsernamePasswordAuthenticationToken(
              userId, null, authorityLoader.authoritiesOf(userId));
      authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
      SecurityContextHolder.getContext().setAuthentication(authentication);
      return true;
    } catch (BusinessException e) {
      SecurityContextHolder.clearContext();
      if (e.errorCode() == ErrorCode.ACCOUNT_SUSPENDED && !openPath(request)) {
        SecurityErrorWriter.write(response, objectMapper, e.errorCode(), e.getMessage());
        return false;
      }
      logger.debug("accessToken 검증 실패: " + e.getMessage());
      return true;
    }
  }

  private static boolean openPath(HttpServletRequest request) {
    String path = request.getRequestURI().substring(request.getContextPath().length());
    return Arrays.stream(SecurityConfig.OPEN_PATHS).anyMatch(pattern -> PATHS.match(pattern, path));
  }

  private static String bearerToken(HttpServletRequest request) {
    String header = request.getHeader(HttpHeaders.AUTHORIZATION);
    if (header == null || !header.startsWith(BEARER)) {
      return null;
    }
    String token = header.substring(BEARER.length()).trim();
    return token.isEmpty() ? null : token;
  }
}
