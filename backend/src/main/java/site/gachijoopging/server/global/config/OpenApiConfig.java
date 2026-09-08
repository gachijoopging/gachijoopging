package site.gachijoopging.server.global.config;

import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.context.annotation.Configuration;
import site.gachijoopging.server.global.security.CurrentUser;

@Configuration
public class OpenApiConfig {

  static {
    SpringDocUtils.getConfig().addAnnotationsToIgnore(CurrentUser.class);
  }
}
