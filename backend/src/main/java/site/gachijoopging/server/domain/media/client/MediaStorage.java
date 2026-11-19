package site.gachijoopging.server.domain.media.client;

import java.io.File;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.springframework.stereotype.Component;
import site.gachijoopging.server.domain.media.service.MediaProperties;
import site.gachijoopging.server.global.error.BusinessException;
import site.gachijoopging.server.global.error.ErrorCode;

@Component
public class MediaStorage {

  private static final Pattern MONTH_FOLDER = Pattern.compile("\\d{4}/\\d{2}");

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

  public void delete(String key) {
    try {
      Files.deleteIfExists(routeInBounds(key));
    } catch (IOException e) {
      throw new UncheckedIOException("사진을 지우지 못했다: " + key, e);
    }
  }

  /** {@code yyyy/MM} 과 {@code deleted/yyyy/MM} 폴더 키. */
  public List<String> monthFolders() {
    List<String> folders = new ArrayList<>(monthFoldersUnder(""));
    folders.addAll(monthFoldersUnder("deleted/"));
    return folders;
  }

  public List<StoredFile> files(String folder) {
    Path dir = routeInBounds(folder);
    if (!Files.isDirectory(dir)) {
      return List.of();
    }
    try (Stream<Path> paths = Files.list(dir)) {
      return paths
          .filter(Files::isRegularFile)
          .flatMap(
              p ->
                  modifiedAt(p)
                      .map(at -> new StoredFile(folder + "/" + p.getFileName(), at))
                      .stream())
          .toList();
    } catch (IOException e) {
      throw new UncheckedIOException("사진 폴더를 읽지 못했다: " + folder, e);
    }
  }

  private List<String> monthFoldersUnder(String prefix) {
    Path base = routeInBounds(prefix);
    if (!Files.isDirectory(base)) {
      return List.of();
    }
    try (Stream<Path> paths = Files.find(base, 2, (p, attrs) -> attrs.isDirectory())) {
      return paths
          .map(p -> base.relativize(p).toString().replace(File.separatorChar, '/'))
          .filter(MONTH_FOLDER.asMatchPredicate())
          .map(month -> prefix + month)
          .toList();
    } catch (IOException e) {
      throw new UncheckedIOException("사진 폴더 목록을 읽지 못했다: " + prefix, e);
    }
  }

  static Optional<Instant> modifiedAt(Path file) {
    try {
      return Optional.of(Files.getLastModifiedTime(file).toInstant());
    } catch (NoSuchFileException e) {
      // 목록을 읽은 뒤 purge·삭제·격리가 파일을 치웠다. 이 파일 때문에 나머지 정리를 멈추지 않는다
      return Optional.empty();
    } catch (IOException e) {
      throw new UncheckedIOException("사진 수정 시각을 읽지 못했다: " + file, e);
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
