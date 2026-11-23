package site.gachijoopging.server.domain.notice.event;

import java.util.UUID;

public record NoticeCreatedEvent(UUID crewId, UUID noticeId, UUID authorId) {}
