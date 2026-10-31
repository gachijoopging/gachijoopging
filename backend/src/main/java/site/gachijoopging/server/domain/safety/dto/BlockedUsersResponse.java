package site.gachijoopging.server.domain.safety.dto;

import java.util.List;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;

/** total 은 커서와 무관한 전체 차단 수다. */
public record BlockedUsersResponse(List<UserBriefResponse> items, String nextCursor, long total) {}
