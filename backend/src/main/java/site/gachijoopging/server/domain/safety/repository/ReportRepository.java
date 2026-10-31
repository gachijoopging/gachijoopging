package site.gachijoopging.server.domain.safety.repository;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.safety.entity.Report;

public interface ReportRepository extends JpaRepository<Report, UUID> {

  // 충돌 대상을 적지 않아 id 와 (신고자, 대상) UNIQUE 를 둘 다 삼킨다 — 하나만 적으면 다른 쪽이 예외로 트랜잭션을 깬다
  @Modifying
  @Query(
      value =
          """
          INSERT INTO reports (id, crew_id, reporter_id, target_type, target_id, reason, memo, created_at)
          VALUES (:id, :crewId, :reporterId, :targetType, :targetId, :reason, :memo, :now)
          ON CONFLICT DO NOTHING
          """,
      nativeQuery = true)
  int insertIfAbsent(
      @Param("id") UUID id,
      @Param("crewId") UUID crewId,
      @Param("reporterId") UUID reporterId,
      @Param("targetType") String targetType,
      @Param("targetId") String targetId,
      @Param("reason") String reason,
      @Param("memo") String memo,
      @Param("now") Instant now);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("SELECT r FROM Report r WHERE r.id = :id")
  Optional<Report> findForUpdate(@Param("id") UUID id);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query(
      """
      SELECT r FROM Report r
      WHERE r.crewId = :crewId AND r.targetId = :userId
        AND r.targetType = site.gachijoopging.server.domain.safety.entity.ReportTargetType.USER
        AND r.status = site.gachijoopging.server.domain.safety.entity.ReportStatus.PENDING
      """)
  List<Report> findPendingUserReportsForUpdate(
      @Param("crewId") UUID crewId, @Param("userId") String userId);
}
