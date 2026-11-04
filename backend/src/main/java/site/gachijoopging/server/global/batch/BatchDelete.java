package site.gachijoopging.server.global.batch;

import java.util.function.IntUnaryOperator;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** 정리 작업의 대량 삭제. 한 트랜잭션에 다 지우면 그동안 잠금이 길어져, 배치마다 따로 커밋한다. */
@Component
public class BatchDelete {

  public static final int SIZE = 1000;

  private final TransactionTemplate tx;

  public BatchDelete(PlatformTransactionManager transactionManager) {
    this.tx = new TransactionTemplate(transactionManager);
    this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  /**
   * {@code deleteUpTo} 는 최대 n 행을 지우고 지운 수를 돌려준다. 고른 행이 동시에 바뀌면 덜 찬 배치도 후보가 남았을 수 있어, 한 행도 못 지울 때까지
   * 돈다.
   */
  public int untilDone(IntUnaryOperator deleteUpTo) {
    int total = 0;
    int removed;
    do {
      removed = tx.execute(status -> deleteUpTo.applyAsInt(SIZE));
      total += removed;
    } while (removed > 0);
    return total;
  }
}
