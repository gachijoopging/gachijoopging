package site.gachijoopging.server.domain.activity.domain.entity;

import java.util.Arrays;
import java.util.Optional;

public enum Category {
  CIGARETTE,
  CAN,
  PLASTIC,
  PAPER,
  GLASS,
  VINYL,
  GENERAL;

  public static Optional<Category> from(String name) {
    return Arrays.stream(values()).filter(c -> c.name().equals(name)).findFirst();
  }
}
