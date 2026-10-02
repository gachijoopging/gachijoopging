package site.gachijoopging.server.support;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.Key;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import org.junit.jupiter.api.Tag;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@SpringBootTest
@Tag("docker")
public abstract class IntegrationTest {

  private static final String CI_POSTGRES_HOST = System.getenv("DOCKERTEST_POSTGRES_HOST");

  private static final String CI_REDIS_HOST = System.getenv("DOCKERTEST_REDIS_HOST");

  private static final String DB_NAME = "test";

  private static final String DB_USER = "test";
  private static final String DB_PASSWORD = "test";

  static final PostgreSQLContainer<?> POSTGRES;
  static final GenericContainer<?> REDIS;

  static {
    if (CI_POSTGRES_HOST != null || CI_REDIS_HOST != null) {
      if (CI_POSTGRES_HOST == null || CI_REDIS_HOST == null) {
        throw new IllegalStateException(
            "DOCKERTEST_POSTGRES_HOST 와 DOCKERTEST_REDIS_HOST 는 함께 설정해야 한다");
      }
      POSTGRES = null;
      REDIS = null;
    } else {
      POSTGRES =
          new PostgreSQLContainer<>(
              DockerImageName.parse("postgis/postgis:16-3.4")
                  .asCompatibleSubstituteFor("postgres"));
      REDIS =
          new GenericContainer<>(DockerImageName.parse("redis:7-alpine")).withExposedPorts(6379);
      POSTGRES.start();
      REDIS.start();
    }
  }

  @DynamicPropertySource
  static void datastoreProperties(DynamicPropertyRegistry registry) {
    if (POSTGRES == null) {
      registry.add(
          "spring.datasource.url",
          () -> "jdbc:postgresql://" + CI_POSTGRES_HOST + ":5432/" + DB_NAME);
      registry.add("spring.datasource.username", () -> DB_USER);
      registry.add("spring.datasource.password", () -> DB_PASSWORD);
      registry.add("spring.data.redis.host", () -> CI_REDIS_HOST);
      registry.add("spring.data.redis.port", () -> 6379);
    } else {
      registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
      registry.add("spring.datasource.username", POSTGRES::getUsername);
      registry.add("spring.datasource.password", POSTGRES::getPassword);
      registry.add("spring.data.redis.host", REDIS::getHost);
      registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
    }
  }

  @DynamicPropertySource
  static void jwtProperties(DynamicPropertyRegistry registry) {
    KeyPair pair = 새_키쌍();
    registry.add("app.jwt.active-kid", () -> "test-kid");
    registry.add("app.jwt.private-key-pem", () -> pem("PRIVATE KEY", pair.getPrivate()));
    registry.add("app.jwt.public-key-pem", () -> pem("PUBLIC KEY", pair.getPublic()));
  }

  @DynamicPropertySource
  static void mediaProperties(DynamicPropertyRegistry registry) {
    registry.add("app.media.root", UPLOAD_ROOT::toString);
    registry.add("app.media.base-url", () -> MEDIA_BASE_URL);
    registry.add("app.media.secure-link-secret", () -> "test-secure-link-secret");
    registry.add("app.ai.base-url", () -> "");
  }

  public static final String MEDIA_BASE_URL = "https://media.test";

  static final Path UPLOAD_ROOT = 임시_업로드_디렉터리();

  private static Path 임시_업로드_디렉터리() {
    try {
      return Files.createTempDirectory("gachijoopging-uploads");
    } catch (IOException e) {
      throw new IllegalStateException("테스트 업로드 디렉터리를 만들지 못했다", e);
    }
  }

  private static KeyPair 새_키쌍() {
    try {
      KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
      generator.initialize(2048);
      return generator.generateKeyPair();
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("테스트 JWT 키 생성 실패", e);
    }
  }

  private static String pem(String label, Key key) {
    return "-----BEGIN "
        + label
        + "-----\n"
        + Base64.getMimeEncoder(64, new byte[] {'\n'}).encodeToString(key.getEncoded())
        + "\n-----END "
        + label
        + "-----";
  }
}
