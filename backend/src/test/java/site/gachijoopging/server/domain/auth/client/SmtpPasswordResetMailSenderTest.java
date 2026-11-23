package site.gachijoopging.server.domain.auth.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import jakarta.mail.SendFailedException;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import site.gachijoopging.server.domain.auth.service.PasswordResetProperties;

@ExtendWith(OutputCaptureExtension.class)
class SmtpPasswordResetMailSenderTest {

  private static final String 받는_주소 = "rejected-user@example.com";

  @Test
  void 받는_주소가_거부돼도_로그에_주소가_남지_않고_원인_종류는_남는다(CapturedOutput 출력) {
    JavaMailSender mailSender = mock(JavaMailSender.class);
    doThrow(
            new MailSendException(
                Map.of(new Object(), new SendFailedException("550 5.1.1 <" + 받는_주소 + ">"))))
        .when(mailSender)
        .send(any(SimpleMailMessage.class));
    var sender =
        new SmtpPasswordResetMailSender(
            mailSender,
            new PasswordResetMailProperties("제목", "noreply@example.com"),
            new PasswordResetProperties(
                Duration.ofMinutes(10), Duration.ofSeconds(60), 5, 10, Duration.ofHours(1)));

    sender.send(받는_주소, "123456");

    assertThat(출력.getOut()).contains("메일 발송 실패", "SendFailedException").doesNotContain(받는_주소);
  }
}
