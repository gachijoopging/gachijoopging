package site.gachijoopging.server.domain.auth.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.auth.service.PasswordResetMailSender;

@Component
@Profile("!prod")
@Slf4j
public class LoggingPasswordResetMailSender implements PasswordResetMailSender {

  // 메일 서버가 없는 환경에서 코드를 받을 길은 로그뿐이다
  @Override
  public void send(String email, String code) {
    log.info("[비밀번호 재설정 메일 — 발송하지 않음] to={} code={}", email, code);
  }
}
