package site.gachijoopging.server.global.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import site.gachijoopging.server.global.config.WebConfig;
import site.gachijoopging.server.global.websocket.WebSocketConfig;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

  // 소켓은 토큰을 헤더가 아니라 쿼리로 받고, 거절도 닫힘 코드로 한다 (global/websocket)
  static final String[] OPEN_PATHS = {
    WebConfig.API_BASE_PATH + "/health",
    WebConfig.API_BASE_PATH + "/auth/**",
    WebSocketConfig.ENDPOINT,
    "/actuator/**"
  };

  private static final String[] ADMIN_PATHS = {WebConfig.ADMIN_BASE_PATH + "/**"};

  @Bean
  public JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint(ObjectMapper objectMapper) {
    return new JwtAuthenticationEntryPoint(objectMapper);
  }

  @Bean
  public JwtAccessDeniedHandler jwtAccessDeniedHandler(ObjectMapper objectMapper) {
    return new JwtAccessDeniedHandler(objectMapper);
  }

  @Bean
  public SecurityFilterChain securityFilterChain(
      HttpSecurity http,
      JwtAuthenticationFilter jwtAuthenticationFilter,
      JwtAuthenticationEntryPoint jwtAuthenticationEntryPoint,
      JwtAccessDeniedHandler jwtAccessDeniedHandler)
      throws Exception {
    return http.csrf(AbstractHttpConfigurer::disable)
        .sessionManagement(
            session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .httpBasic(AbstractHttpConfigurer::disable)
        .formLogin(AbstractHttpConfigurer::disable)
        .authorizeHttpRequests(
            requests ->
                requests
                    .requestMatchers(OPEN_PATHS)
                    .permitAll()
                    .requestMatchers(ADMIN_PATHS)
                    .hasRole("ADMIN")
                    .anyRequest()
                    .authenticated())
        .exceptionHandling(
            handling ->
                handling
                    .authenticationEntryPoint(jwtAuthenticationEntryPoint)
                    .accessDeniedHandler(jwtAccessDeniedHandler))
        .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
        .build();
  }
}
