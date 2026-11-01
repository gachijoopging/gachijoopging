package site.gachijoopging.server.domain.notification.client;

import java.util.Map;

public record FcmPush(String token, String title, String body, Map<String, String> data) {}
