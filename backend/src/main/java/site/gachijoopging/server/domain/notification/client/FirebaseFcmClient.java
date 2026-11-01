package site.gachijoopging.server.domain.notification.client;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.BatchResponse;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.Notification;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

// 자격이 없거나 잘못돼도 기동을 막지 않는다 — 알림 행은 그대로 남고 발송만 빠진다 (application.yml app.fcm)
@Slf4j
@Component
public class FirebaseFcmClient {

  private static final String APP_NAME = "gachijoopging";

  // FCM sendEach 한 번에 담을 수 있는 최대 메시지 수
  private static final int BATCH = 500;

  private final FirebaseMessaging messaging;

  public FirebaseFcmClient(FcmProperties properties) {
    String credentials = properties.credentials();
    this.messaging =
        credentials == null || credentials.isBlank() ? null : connect(properties, credentials);
    if (messaging == null) {
      log.warn("FCM 자격이 없다 (FCM_CREDENTIALS) — 푸시 발송을 건너뛴다");
    }
  }

  public boolean enabled() {
    return messaging != null;
  }

  public void send(List<FcmPush> pushes) {
    if (messaging == null) {
      return;
    }
    for (int from = 0; from < pushes.size(); from += BATCH) {
      List<Message> messages =
          pushes.subList(from, Math.min(from + BATCH, pushes.size())).stream()
              .map(FirebaseFcmClient::message)
              .toList();
      try {
        BatchResponse response = messaging.sendEach(messages);
        if (response.getFailureCount() > 0) {
          log.warn(
              "FCM 발송 {}건 중 {}건 실패 — 알림 목록에는 남아 있다", messages.size(), response.getFailureCount());
        }
      } catch (Exception e) {
        log.warn("FCM 발송 실패 — 알림 목록에는 남아 있다: {}", e.toString());
      }
    }
  }

  private static Message message(FcmPush push) {
    return Message.builder()
        .setToken(push.token())
        .setNotification(Notification.builder().setTitle(push.title()).setBody(push.body()).build())
        .putAllData(push.data())
        .build();
  }

  private static FirebaseMessaging connect(FcmProperties properties, String credentials) {
    try {
      FirebaseOptions options =
          FirebaseOptions.builder()
              .setCredentials(
                  GoogleCredentials.fromStream(
                      new ByteArrayInputStream(credentials.getBytes(StandardCharsets.UTF_8))))
              .setConnectTimeout((int) properties.connectTimeout().toMillis())
              .setReadTimeout((int) properties.readTimeout().toMillis())
              .build();
      return FirebaseMessaging.getInstance(FirebaseApp.initializeApp(options, APP_NAME));
    } catch (IOException | RuntimeException e) {
      log.error("FCM 자격을 읽지 못했다 — 푸시 발송을 건너뛴다: {}", e.toString());
      return null;
    }
  }
}
