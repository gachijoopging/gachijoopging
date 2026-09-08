package site.gachijoopging.server.domain.media.infrastructure.client;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.media.domain.policy.MediaProperties;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

@Component
public class MediaStorage {

  private final Path root;

  public MediaStorage(MediaProperties properties) {
    this.root = Path.of(properties.root()).toAbsolutePath().normalize();
  }

  public void store(String key, byte[] content) {
    Path target = routeInBounds(key);
    try {
      Files.createDirectories(target.getParent());
      Files.write(target, content);
    } catch (IOException e) {
      throw new UncheckedIOException("사진을 저장하지 못했다: " + key, e);
    }
  }

  public void move(String fromKey, String toKey) {
    Path original = routeInBounds(fromKey);
    Path target = routeInBounds(toKey);
    try {
      Files.createDirectories(target.getParent());
      Files.move(original, target, StandardCopyOption.REPLACE_EXISTING);
    } catch (IOException e) {
      throw new UncheckedIOException("사진을 옮기지 못했다: " + fromKey + " → " + toKey, e);
    }
  }

  private Path routeInBounds(String key) {
    Path target;
    try {
      target = root.resolve(key).normalize();
    } catch (InvalidPathException e) {
      throw new BusinessException(ErrorCode.INTERNAL, "저장 키가 경로가 아니다: " + key);
    }
    if (!target.startsWith(root)) {
      throw new BusinessException(ErrorCode.INTERNAL, "저장 키가 경계를 벗어났다: " + key);
    }
    return target;
  }
}
