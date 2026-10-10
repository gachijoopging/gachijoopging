package site.gachijoopging.server.domain.crew.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.crew.entity.CrewJoinRequest;
import site.gachijoopging.server.domain.crew.entity.JoinRequestStatus;

public interface CrewJoinRequestRepository extends JpaRepository<CrewJoinRequest, UUID> {

  Optional<CrewJoinRequest> findFirstByUserIdOrderByCreatedAtDesc(UUID userId);

  Optional<CrewJoinRequest> findByUserIdAndStatus(UUID userId, JoinRequestStatus status);

  Optional<CrewJoinRequest> findByIdAndCrewId(UUID id, UUID crewId);

  // 한 사람의 대기 신청은 부분 유일 인덱스가 하나로 막는다 — 동시에 두 번 눌러도 예외 없이 0행
  @Modifying
  @Query(
      value =
          """
          INSERT INTO crew_join_requests (id, crew_id, user_id, status, created_at)
          VALUES (:id, :crewId, :userId, 'PENDING', :now)
          ON CONFLICT DO NOTHING
          """,
      nativeQuery = true)
  int insertPendingIfAbsent(
      @Param("id") UUID id,
      @Param("crewId") UUID crewId,
      @Param("userId") UUID userId,
      @Param("now") Instant now);

  @Modifying
  @Query(
      value =
          """
          INSERT INTO crew_join_requests (id, crew_id, user_id, status, created_at, decided_at)
          VALUES (:id, :crewId, :userId, 'APPROVED', :now, :now)
          """,
      nativeQuery = true)
  void insertApproved(
      @Param("id") UUID id,
      @Param("crewId") UUID crewId,
      @Param("userId") UUID userId,
      @Param("now") Instant now);

  // 다른 기기에서 먼저 처리한 신청을 다시 처리하지 않도록 PENDING 일 때만 바꾼다
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(
      """
      UPDATE CrewJoinRequest r
      SET r.status = :status, r.decidedBy = :decidedBy, r.decidedAt = :now
      WHERE r.id = :id AND r.status = site.gachijoopging.server.domain.crew.entity.JoinRequestStatus.PENDING
      """)
  int closeIfPending(
      @Param("id") UUID id,
      @Param("status") JoinRequestStatus status,
      @Param("decidedBy") UUID decidedBy,
      @Param("now") Instant now);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query(
      """
      UPDATE CrewJoinRequest r
      SET r.status = site.gachijoopging.server.domain.crew.entity.JoinRequestStatus.CANCELED,
          r.decidedAt = :now
      WHERE r.userId = :userId
        AND r.status = site.gachijoopging.server.domain.crew.entity.JoinRequestStatus.PENDING
      """)
  int cancelPending(@Param("userId") UUID userId, @Param("now") Instant now);

  // 크루장 화면은 먼저 신청한 순이라 다른 목록과 달리 오름차순 keyset 이다
  @Query(
      value =
          """
          SELECT * FROM crew_join_requests
          WHERE crew_id = :crewId AND status = 'PENDING'
          ORDER BY created_at, id
          LIMIT :limit
          """,
      nativeQuery = true)
  List<CrewJoinRequest> findPendingFirstPage(
      @Param("crewId") UUID crewId, @Param("limit") int limit);

  @Query(
      value =
          """
          SELECT * FROM crew_join_requests
          WHERE crew_id = :crewId AND status = 'PENDING'
            AND (created_at, id) > (:afterCreatedAt, :afterId)
          ORDER BY created_at, id
          LIMIT :limit
          """,
      nativeQuery = true)
  List<CrewJoinRequest> findPendingAfter(
      @Param("crewId") UUID crewId,
      @Param("afterCreatedAt") Instant afterCreatedAt,
      @Param("afterId") UUID afterId,
      @Param("limit") int limit);
}
