package site.gachijoopging.server.global.security;

import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.MethodParameter;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

public class CurrentCrewArgumentResolver implements HandlerMethodArgumentResolver {

  private final ObjectProvider<CrewMembershipLoader> loader;

  public CurrentCrewArgumentResolver(ObjectProvider<CrewMembershipLoader> loader) {
    this.loader = loader;
  }

  @Override
  public boolean supportsParameter(MethodParameter parameter) {
    return parameter.hasParameterAnnotation(CurrentCrew.class)
        && CrewMembership.class.isAssignableFrom(parameter.getParameterType());
  }

  @Override
  public Object resolveArgument(
      MethodParameter parameter,
      ModelAndViewContainer mavContainer,
      NativeWebRequest webRequest,
      WebDataBinderFactory binderFactory) {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null || !(authentication.getPrincipal() instanceof UUID userId)) {
      throw new BusinessException(ErrorCode.TOKEN_EXPIRED, "인증 없이 @CurrentCrew 에 닿았다");
    }
    return loader
        .getObject()
        .membershipOf(userId)
        .orElseThrow(() -> new BusinessException(ErrorCode.NO_CREW, "소속 크루가 없다"));
  }
}
