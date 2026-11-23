package site.gachijoopging.server.domain.safety.service;

import java.time.Clock;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.crew.dto.UserBriefResponse;
import site.gachijoopging.server.domain.media.service.MediaSignedUrl;
import site.gachijoopging.server.domain.safety.dto.BlockedUsersResponse;
import site.gachijoopging.server.domain.safety.repository.BlockRepository;
import site.gachijoopging.server.domain.safety.repository.BlockRepository.BlockedRow;
import site.gachijoopging.server.global.response.Cursors;

// 차단은 한 방향이다 — 각 도메인 조회가 blocker = 보는 사람, blocked = 작성자로 걸러 차단한 사람에게서만 숨긴다 (ERD blocks)
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BlockService {

  private final BlockRepository blockRepository;
  private final MediaSignedUrl signedUrl;
  private final Clock clock;

  @Transactional
  public void block(UUID me, UUID userId) {
    blockRepository.insertIfAbsent(me, userId, clock.instant());
  }

  @Transactional
  public void unblock(UUID me, UUID userId) {
    blockRepository.delete(me, userId);
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public void withdraw(UUID me) {
    blockRepository.deleteAllOf(me);
  }

  public BlockedUsersResponse blocked(UUID me, String cursor, int limit) {
    Cursors.Cursor before = cursor == null ? null : Cursors.decode(cursor);
    List<BlockedRow> rows =
        blockRepository.findPage(
            me,
            before == null ? null : before.createdAt(),
            before == null ? null : before.id(),
            limit + 1);
    List<BlockedRow> page = rows.subList(0, Math.min(limit, rows.size()));
    String next =
        rows.size() > limit
            ? Cursors.encode(page.getLast().blockedAt(), page.getLast().id())
            : null;
    return new BlockedUsersResponse(
        page.stream().map(this::brief).toList(), next, blockRepository.count(me));
  }

  private UserBriefResponse brief(BlockedRow row) {
    return UserBriefResponse.of(
        row.id(),
        row.status(),
        row.nickname(),
        row.photoKey() == null ? null : signedUrl.of(row.photoKey()));
  }
}
