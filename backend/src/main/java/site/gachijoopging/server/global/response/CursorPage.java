package site.gachijoopging.server.global.response;

import java.util.List;

public record CursorPage<T>(List<T> items, String nextCursor) {}
