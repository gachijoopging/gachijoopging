package site.gachijoopging.server.global.batch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.util.ArrayDeque;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;

class BatchDeleteTest {

  @Test
  void 한_행도_못_지울_때까지_반복하고_합계를_돌려준다() {
    var 결과 = new ArrayDeque<>(List.of(BatchDelete.SIZE, BatchDelete.SIZE, 3, 0, 99));
    BatchDelete batchDelete = new BatchDelete(mock(PlatformTransactionManager.class));

    int 합계 = batchDelete.untilDone(n -> 결과.pop());

    assertThat(합계).isEqualTo(BatchDelete.SIZE * 2 + 3);
    assertThat(결과).containsExactly(99);
  }

  @Test
  void 동시_갱신으로_덜_찬_배치가_나와도_남은_후보를_이어서_지운다() {
    var 결과 = new ArrayDeque<>(List.of(BatchDelete.SIZE - 1, BatchDelete.SIZE, 7, 0));
    BatchDelete batchDelete = new BatchDelete(mock(PlatformTransactionManager.class));

    int 합계 = batchDelete.untilDone(n -> 결과.pop());

    assertThat(합계).isEqualTo(BatchDelete.SIZE * 2 - 1 + 7);
    assertThat(결과).isEmpty();
  }
}
