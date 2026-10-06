package site.gachijoopging.server.domain.auth.client;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.auth.service.PasswordResetMailSender;
import site.gachijoopging.server.domain.auth.service.PasswordResetProperties;

@Component
@RequiredArgsConstructor
@Profile("prod")
@Slf4j
public class SmtpPasswordResetMailSender implements PasswordResetMailSender {

  private final JavaMailSender mailSender;
  private final PasswordResetMailProperties properties;
  private final PasswordResetProperties passwordReset;

  @Override
  public void send(String email, String code) {
    SimpleMailMessage message = new SimpleMailMessage();
    message.setFrom(properties.from());
    message.setTo(email);
    message.setSubject(properties.subject());
    message.setText(
        """
        가치줍깅 앱의 비밀번호 재설정 화면에 아래 6자리 코드를 입력하세요. 코드는 %d분 동안만 쓸 수 있습니다.

        %s

        본인이 요청하지 않았다면 이 메일을 무시하세요.
        """
            .formatted(passwordReset.codeTtl().toMinutes(), code));

    try {
      mailSender.send(message);
    } catch (MailException e) {
      log.error("비밀번호 재설정 메일 발송 실패 to={}", email, e);
    }
  }
}
