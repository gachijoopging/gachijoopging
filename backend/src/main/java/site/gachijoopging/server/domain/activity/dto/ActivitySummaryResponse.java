package site.gachijoopging.server.domain.activity.dto;

import java.util.List;
import java.util.Map;

public record ActivitySummaryResponse(
    int itemCount, Map<String, Integer> byCategory, List<ItemResponse> items) {}
