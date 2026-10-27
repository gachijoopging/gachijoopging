package site.gachijoopging.server.global.security.jwt;

import com.auth0.jwt.JWT;
import com.auth0.jwt.algorithms.Algorithm;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.global.security.SessionVersionLoader;

@Component
public class JwtIssuer {

  private final String activeKid;
  private final Algorithm algorithm;
  private final Duration accessTokenTtl;
  private final Clock clock;
  private final SessionVersionLoader sessionVersionLoader;

  public JwtIssuer(
      JwtProperties properties, Clock clock, SessionVersionLoader sessionVersionLoader) {
    this.activeKid = properties.activeKid();
    this.algorithm =
        Algorithm.RSA256(
            RsaPem.publicKey(properties.publicKeyPem()),
            RsaPem.privateKey(properties.privateKeyPem()));
    this.accessTokenTtl = properties.accessTokenTtl();
    this.clock = clock;
    this.sessionVersionLoader = sessionVersionLoader;
  }

  public String issue(UUID userId) {
    Instant now = clock.instant();
    return JWT.create()
        .withKeyId(activeKid)
        .withSubject(userId.toString())
        .withClaim(JwtVerifier.SESSION_VERSION_CLAIM, sessionVersionOf(userId))
        .withIssuedAt(now)
        .withExpiresAt(now.plus(accessTokenTtl))
        .sign(algorithm);
  }

  private int sessionVersionOf(UUID userId) {
    return sessionVersionLoader
        .sessionVersionOf(userId)
        .orElseThrow(() -> new IllegalStateException("없는 사용자에게 토큰을 발급하려 했다: " + userId));
  }
}
