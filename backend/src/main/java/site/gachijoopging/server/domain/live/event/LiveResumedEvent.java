package site.gachijoopging.server.domain.live.event;

import java.util.UUID;

// 갱신이 끊겨 정리된 활동의 보고가 다시 왔다. 크루원 목록엔 다시 넣되 활동 시작 알림은 내지 않는다
public record LiveResumedEvent(UUID crewId, UUID userId, UUID activityId) {}
