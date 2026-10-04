package site.gachijoopging.server.domain.auth.service;

public interface PasswordResetMailSender {

  void send(String email, String rawToken);
}
