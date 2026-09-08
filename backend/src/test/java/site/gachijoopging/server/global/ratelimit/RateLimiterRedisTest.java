package site.gachijoopging.server.global.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import site.gachijoopging.server.support.IntegrationTest;

class RateLimiterRedisTest extends IntegrationTest {

  private static final Duration 창 = Duration.ofMinutes(10);

  @Autowired private RateLimiter rateLimiter;
  @Autowired private StringRedisTemplate redis;

  @Test
  void 한도까지는_통과하고_넘으면_막는다() {
    String 키 = 새_키();

    for (int i = 0; i < 3; i++) {
      assertThat(rateLimiter.tryAcquire(키, 3, 창)).isTrue();
    }
    assertThat(rateLimiter.tryAcquire(키, 3, 창)).isFalse();
  }

  @Test
  void 세는_키에는_언제나_만료가_걸린다() {
    String 키 = 새_키();

    rateLimiter.tryAcquire(키, 3, 창);
    assertThat(redis.getExpire(키)).isPositive();

    rateLimiter.tryAcquire(키, 3, 창);
    assertThat(redis.getExpire(키)).isPositive();
  }

  private String 새_키() {
    return "ratelimit-test:" + UUID.randomUUID();
  }
}
