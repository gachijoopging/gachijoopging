package site.gachijoopging.server.global.batch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.util.ArrayDeque;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;

class BatchDeleteTest {

  @Test
  void 배치가_덜_찰_때까지_반복하고_합계를_돌려준다() {
    var 결과 = new ArrayDeque<>(List.of(BatchDelete.SIZE, BatchDelete.SIZE, 3, 99));
    BatchDelete batchDelete = new BatchDelete(mock(PlatformTransactionManager.class));

    int 합계 = batchDelete.untilDone(n -> 결과.pop());

    assertThat(합계).isEqualTo(BatchDelete.SIZE * 2 + 3);
    assertThat(결과).containsExactly(99);
  }
}
