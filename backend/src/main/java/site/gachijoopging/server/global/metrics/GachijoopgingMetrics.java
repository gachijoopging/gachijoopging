package site.gachijoopging.server.global.metrics;

import java.util.LinkedHashSet;
import java.util.Set;
import java.util.stream.Collectors;

public final class GachijoopgingMetrics {

  public static final String LOGIN_ATTEMPT = "gachijoopging.login.attempt";

  public static final String LOGIN_FAILURE = "gachijoopging.login.failure";

  public static final String MEDIA_FILE = "gachijoopging.media.file";

  public static final String MEDIA_REFERENCED = "gachijoopging.media.referenced";

  public static final String MODULE = "module";

  private static final Set<String> COUNTERS = Set.of(LOGIN_ATTEMPT, LOGIN_FAILURE);

  private static final Set<String> GAUGES = Set.of(MEDIA_FILE, MEDIA_REFERENCED);

  private GachijoopgingMetrics() {}

  public static Set<String> prometheusNames() {
    Set<String> names = new LinkedHashSet<>();
    names.addAll(
        COUNTERS.stream().map(name -> underscore(name) + "_total").collect(Collectors.toSet()));
    names.addAll(GAUGES.stream().map(GachijoopgingMetrics::underscore).collect(Collectors.toSet()));
    return Set.copyOf(names);
  }

  private static String underscore(String name) {
    return name.replace('.', '_');
  }
}
