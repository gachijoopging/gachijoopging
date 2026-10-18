package site.gachijoopging.server.global.lock;

import jakarta.persistence.EntityManager;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 소속·대기 신청·진행 중 활동은 사람 단위 불변식이라 한 사람의 가입·신청·만들기·나가기·활동 시작을 줄 세운다.
// 크루 잠금보다 먼저 잡는다. users 는 user 도메인 테이블이라 행 잠금 대신 advisory lock 을 쓰고,
// 여러 도메인이 같은 키를 써야 하므로 여기 한 곳에 둔다
@Component
@RequiredArgsConstructor
public class UserLock {

  private final EntityManager entityManager;

  // 트랜잭션 밖에서 잡으면 즉시 풀려 아무것도 막지 못한다
  @Transactional(propagation = Propagation.MANDATORY)
  public void lock(UUID userId) {
    entityManager
        .createNativeQuery(
            "SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended(CAST(:userId AS text), 0))) l")
        .setParameter("userId", userId)
        .getSingleResult();
  }
}
