package site.gachijoopging.server.domain.auth.client;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.auth.service.PasswordResetMailSender;

@Component
@RequiredArgsConstructor
@Profile("!prod")
@Slf4j
public class LoggingPasswordResetMailSender implements PasswordResetMailSender {

  private final PasswordResetMailProperties properties;

  @Override
  public void send(String email, String rawToken) {
    log.info("[비밀번호 재설정 메일 — 발송하지 않음] to={} link={}", email, properties.link(rawToken));
  }
}
