package site.gachijoopging.server.global.ratelimit;

import java.time.Duration;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class RateLimiter {

  private static final RedisScript<Long> COUNT_AND_EXPIRE =
      new DefaultRedisScript<>(
          """
          local count = redis.call('INCR', KEYS[1])
          if count == 1 then
            redis.call('PEXPIRE', KEYS[1], ARGV[1])
          end
          return count
          """,
          Long.class);

  private final StringRedisTemplate redis;

  public boolean tryAcquire(String key, int limit, Duration window) {
    Long count;
    try {
      count = redis.execute(COUNT_AND_EXPIRE, List.of(key), String.valueOf(window.toMillis()));
    } catch (DataAccessException e) {
      log.warn("요청 제한을 확인하지 못해 통과시킨다: key={}", key, e);
      return true;
    }
    if (count == null) {
      log.warn("요청 제한 스크립트가 값을 주지 않아 통과시킨다: key={}", key);
      return true;
    }
    return count <= limit;
  }
}
