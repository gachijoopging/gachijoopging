package site.gachijoopging.server.global.websocket;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;
import site.gachijoopging.server.global.config.WebConfig;
import site.gachijoopging.server.global.security.CrewMembershipLoader;
import site.gachijoopging.server.global.security.jwt.JwtVerifier;

@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

  public static final String ENDPOINT = WebConfig.API_BASE_PATH + "/ws";

  public static final String CREW_QUEUE = "/queue/crew";

  private static final String SUBSCRIBABLE = "/user" + CREW_QUEUE;

  private static final String APP_PREFIX = "/app";

  private final JwtVerifier jwtVerifier;
  private final ObjectProvider<CrewMembershipLoader> crewMembershipLoader;

  @Override
  public void registerStompEndpoints(StompEndpointRegistry registry) {
    // 앱은 브라우저가 아니고 인증은 토큰이 맡는다. Origin 을 보내지 않거나 제각각이다
    registry
        .addEndpoint(ENDPOINT)
        .setHandshakeHandler(new TokenHandshakeHandler(jwtVerifier))
        .setAllowedOriginPatterns("*");
  }

  // 서버가 한 대(ADR-0005)라 simple broker 다. 인스턴스를 늘리면 브로커를 바꾼다
  @Override
  public void configureMessageBroker(MessageBrokerRegistry registry) {
    registry.enableSimpleBroker("/queue");
    registry.setApplicationDestinationPrefixes(APP_PREFIX);
  }

  @Override
  public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
    registration.addDecoratorFactory(
        handler -> new CrewSessionGuard(handler, crewMembershipLoader));
  }

  // 크루는 서버가 정한다. 다른 경로를 구독하거나 브로커에 직접 보내면 남의 큐에 닿을 수 있다
  @Override
  public void configureClientInboundChannel(ChannelRegistration registration) {
    registration.interceptors(
        new ChannelInterceptor() {
          @Override
          public Message<?> preSend(Message<?> message, MessageChannel channel) {
            StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
            String destination = accessor.getDestination();
            if (accessor.getCommand() == StompCommand.SUBSCRIBE
                && !SUBSCRIBABLE.equals(destination)) {
              throw new MessagingException("구독할 수 있는 곳은 " + SUBSCRIBABLE + " 하나다");
            }
            if (accessor.getCommand() == StompCommand.SEND
                && (destination == null || !destination.startsWith(APP_PREFIX + "/"))) {
              throw new MessagingException("보낼 수 있는 곳은 " + APP_PREFIX + "/... 다");
            }
            return message;
          }
        });
  }
}
