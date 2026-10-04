package site.gachijoopging.server.global.config;

import com.fasterxml.jackson.databind.Module;
import com.fasterxml.jackson.datatype.jdk8.Jdk8Module;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class JacksonConfig {

  // PATCH 요청의 Optional 필드는 "키가 없으면 그대로, null 이면 지운다" 를 가른다. 기본 Jdk8Module 은
  // 키가 없어도 Optional.empty 로 읽어 둘이 같아지므로, 없는 키는 null 로 읽게 바꾼다
  @Bean
  public Module jdk8Module() {
    return new Jdk8Module().configureReadAbsentAsNull(true);
  }
}
