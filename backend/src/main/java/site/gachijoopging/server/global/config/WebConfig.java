package site.gachijoopging.server.global.config;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.HandlerTypePredicate;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.PathMatchConfigurer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import site.gachijoopging.server.global.security.CrewMembershipLoader;
import site.gachijoopging.server.global.security.CurrentCrewArgumentResolver;
import site.gachijoopging.server.global.security.CurrentUserArgumentResolver;
import site.gachijoopging.server.global.web.NoApiPrefix;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

  public static final String API_BASE_PATH = "/api/v1";

  public static final String ADMIN_BASE_PATH = "/admin";

  private static final String OUR_CONTROLLERS = "site.gachijoopging.server";
  private static final String ADMIN_CONTROLLERS = "site.gachijoopging.server.domain.admin";

  private final ObjectProvider<CrewMembershipLoader> crewMembershipLoader;

  @Override
  public void configurePathMatch(PathMatchConfigurer configurer) {
    configurer.addPathPrefix(
        ADMIN_BASE_PATH, HandlerTypePredicate.forBasePackage(ADMIN_CONTROLLERS));
    configurer.addPathPrefix(
        API_BASE_PATH,
        HandlerTypePredicate.forBasePackage(OUR_CONTROLLERS)
            .and(type -> !type.isAnnotationPresent(NoApiPrefix.class)));
  }

  @Override
  public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
    resolvers.add(new CurrentUserArgumentResolver());
    resolvers.add(new CurrentCrewArgumentResolver(crewMembershipLoader));
  }
}
