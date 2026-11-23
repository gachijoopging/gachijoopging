package site.gachijoopging.server.global.security.jwt;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(
    String activeKid,
    String privateKeyPem,
    String publicKeyPem,
    String previousKid,
    String previousPublicKeyPem,
    Duration accessTokenTtl) {}
