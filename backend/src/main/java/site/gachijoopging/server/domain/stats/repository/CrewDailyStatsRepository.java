package site.gachijoopging.server.domain.stats.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import site.gachijoopging.server.domain.stats.dto.StatsDelta;

@Repository
@RequiredArgsConstructor
public class CrewDailyStatsRepository {

  private final JdbcClient jdbc;
  private final ObjectMapper objectMapper;

  // 0 이 된 카테고리는 지워 활동 상세의 byCategory 와 모양을 맞춘다
  public void add(UUID crewId, LocalDate date, StatsDelta delta) {
    jdbc.sql(
            """
            INSERT INTO crew_daily_stats (crew_id, date, item_count, distance_m, duration_sec,
                                          activity_count, by_category)
            VALUES (:crewId, :date, :itemCount, :distanceM, :durationSec, :activityCount,
                    CAST(:byCategory AS jsonb))
            ON CONFLICT (crew_id, date) DO UPDATE SET
              item_count = crew_daily_stats.item_count + EXCLUDED.item_count,
              distance_m = crew_daily_stats.distance_m + EXCLUDED.distance_m,
              duration_sec = crew_daily_stats.duration_sec + EXCLUDED.duration_sec,
              activity_count = crew_daily_stats.activity_count + EXCLUDED.activity_count,
              by_category = (
                SELECT coalesce(jsonb_object_agg(key, total), '{}')
                FROM (
                  SELECT key, sum(value::int) AS total
                  FROM (
                    SELECT * FROM jsonb_each_text(crew_daily_stats.by_category)
                    UNION ALL
                    SELECT * FROM jsonb_each_text(EXCLUDED.by_category)
                  ) e
                  GROUP BY key
                  HAVING sum(value::int) <> 0
                ) s
              )
            """)
        .param("crewId", crewId)
        .param("date", date)
        .param("itemCount", delta.itemCount())
        .param("distanceM", delta.distanceM())
        .param("durationSec", delta.durationSec())
        .param("activityCount", delta.activityCount())
        .param("byCategory", json(delta))
        .update();
  }

  private String json(StatsDelta delta) {
    try {
      return objectMapper.writeValueAsString(delta.byCategory());
    } catch (JsonProcessingException e) {
      throw new IllegalStateException("카테고리별 수량을 JSON 으로 바꾸지 못했다", e);
    }
  }
}
