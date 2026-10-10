package site.gachijoopging.server.domain.crew.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import site.gachijoopging.server.domain.crew.entity.JoinPolicy;
import site.gachijoopging.server.domain.crew.entity.Region;

public record CrewResponse(
    String id,
    String name,
    String intro,
    @Schema(nullable = true) String photoUrl,
    UserBriefResponse leader,
    Region region,
    JoinPolicy joinPolicy,
    int memberCount,
    int goalCount,
    int pendingJoinRequests,
    @Schema(nullable = true) PinnedNotice pinnedNotice,
    int unreadChat,
    boolean isLeader) {

  public record PinnedNotice(String id, String title, Instant createdAt) {}
}
