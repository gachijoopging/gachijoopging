package site.gachijoopging.server.domain.auth.domain.service;

public interface PasswordResetMailSender {

  void send(String email, String rawToken);
}
