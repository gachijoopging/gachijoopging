package site.gachijoopging.server.domain.stats.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import site.gachijoopging.server.domain.stats.dto.StatsDelta;
import site.gachijoopging.server.domain.stats.repository.CrewDailyStatsRepository;

@Service
@RequiredArgsConstructor
public class StatsService {

  private static final ZoneId KST = ZoneId.of("Asia/Seoul");

  private final CrewDailyStatsRepository crewDailyStatsRepository;

  // 활동을 바꾸는 트랜잭션 안에서만 부른다 — 따로 커밋되면 합산이 활동과 어긋난다.
  // 활동은 시작한 날에 센다 (ERD crew_daily_stats: 날짜는 KST)
  @Transactional(propagation = Propagation.MANDATORY)
  public void add(UUID crewId, Instant startedAt, StatsDelta delta) {
    crewDailyStatsRepository.add(crewId, LocalDate.ofInstant(startedAt, KST), delta);
  }
}
