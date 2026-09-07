package site.gachijoopging.server.domain.auth.infrastructure.client;

import com.auth0.jwk.JwkProvider;
import com.auth0.jwk.JwkProviderBuilder;
import java.net.MalformedURLException;
import java.net.URI;
import java.util.concurrent.TimeUnit;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class GoogleAuthClientConfig {

  private static final long CACHE_SIZE = 10;

  private static final long CACHE_TTL_HOURS = 1;

  private static final long MAX_CALLS_PER_MINUTE = 10;

  @Bean
  public JwkProvider googleJwkProvider(GoogleAuthProperties properties) {
    try {
      return new JwkProviderBuilder(URI.create(properties.jwksUri()).toURL())
          .cached(CACHE_SIZE, CACHE_TTL_HOURS, TimeUnit.HOURS)
          .rateLimited(MAX_CALLS_PER_MINUTE, 1, TimeUnit.MINUTES)
          .build();
    } catch (MalformedURLException e) {
      throw new IllegalStateException(
          "app.google-auth.jwks-uri 가 URL 이 아니다: " + properties.jwksUri(), e);
    }
  }
}
