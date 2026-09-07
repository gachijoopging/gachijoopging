package site.gachijoopging.server.global.security.jwt;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class JwtIssuer {

  private final String activeKid;
  private final Algorithm algorithm;
  private final Duration accessTokenTtl;
  private final Clock clock;

  public JwtIssuer(JwtProperties properties, Clock clock) {
    this.activeKid = properties.activeKid();
    this.algorithm =
        Algorithm.RSA256(
            RsaPem.publicKey(properties.publicKeyPem()),
            RsaPem.privateKey(properties.privateKeyPem()));
    this.accessTokenTtl = properties.accessTokenTtl();
    this.clock = clock;
  }

  public String issue(UUID userId) {
    Instant now = clock.instant();
    return JWT.create()
        .withKeyId(activeKid)
        .withSubject(userId.toString())
        .withIssuedAt(now)
        .withExpiresAt(now.plus(accessTokenTtl))
        .sign(algorithm);
  }
}
