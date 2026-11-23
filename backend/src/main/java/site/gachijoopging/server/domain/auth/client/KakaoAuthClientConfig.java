package site.gachijoopging.server.domain.auth.client;

import org.springframework.boot.http.client.ClientHttpRequestFactoryBuilder;
import org.springframework.boot.http.client.ClientHttpRequestFactorySettings;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class KakaoAuthClientConfig {

  @Bean
  public RestClient kakaoAuthRestClient(KakaoAuthProperties properties) {
    ClientHttpRequestFactorySettings settings =
        ClientHttpRequestFactorySettings.defaults()
            .withConnectTimeout(properties.timeout())
            .withReadTimeout(properties.timeout());
    ClientHttpRequestFactory requestFactory =
        ClientHttpRequestFactoryBuilder.detect().build(settings);
    return RestClient.builder()
        .requestFactory(requestFactory)
        .baseUrl(properties.baseUrl())
        .build();
  }
}
