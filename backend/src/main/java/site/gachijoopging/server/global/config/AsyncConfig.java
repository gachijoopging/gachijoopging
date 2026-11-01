package site.gachijoopging.server.global.config;

import java.util.concurrent.ThreadPoolExecutor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

// 커밋 뒤 외부 발송(FCM)을 요청 스레드에서 하면 응답이 그 왕복을 기다리고, 커밋 뒤 리스너가 도는 동안은
// 커넥션도 아직 풀로 돌아가지 않는다
@Configuration
@EnableAsync
public class AsyncConfig {

  public static final String PUSH_EXECUTOR = "pushExecutor";

  // 큐가 차면 발행한 스레드가 직접 보낸다 — 푸시를 버리지 않고 느려지는 쪽을 고른다
  @Bean(PUSH_EXECUTOR)
  public ThreadPoolTaskExecutor pushExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(2);
    executor.setMaxPoolSize(4);
    executor.setQueueCapacity(1000);
    executor.setThreadNamePrefix("push-");
    executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
    executor.setWaitForTasksToCompleteOnShutdown(true);
    executor.setAwaitTerminationSeconds(10);
    return executor;
  }
}
