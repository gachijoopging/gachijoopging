package site.gachijoopging.server.global.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;

class RateLimiterTest {

  @Test
  void redis_가_죽으면_막지_않는다() {
    StringRedisTemplate 죽은_redis =
        mock(
            StringRedisTemplate.class,
            호출 -> {
              throw new RedisConnectionFailureException("연결 끊김");
            });

    assertThat(new RateLimiter(죽은_redis).tryAcquire("키", 10, Duration.ofMinutes(10))).isTrue();
  }
}
