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

  // 추방자의 대기 신청은 정상 흐름에선 생기지 않지만, 생겼다면 공개 전환으로 우회 가입하지 못하게 뺀다
  @Query(
      value =
          """
          SELECT count(*) FROM crew_join_requests r
          WHERE r.crew_id = :crewId AND r.status = 'PENDING'
            AND NOT EXISTS (SELECT 1 FROM crew_expulsions e
                            WHERE e.crew_id = r.crew_id AND e.user_id = r.user_id)
          """,
      nativeQuery = true)
  int countAdmissiblePending(@Param("crewId") UUID crewId);

  // 승인한 신청자마다 이벤트를 내야 해 RETURNING 행이 필요하다. @Modifying 은 목록을 못 돌려주고,
  // clearAutomatically 를 붙이면 호출자가 잠근 Crew 가 detach 돼 같은 요청의 수정이 저장되지 않는다
  @Query(
      value =
          """
          WITH approved AS (
            UPDATE crew_join_requests r
            SET status = 'APPROVED', decided_by = :decidedBy, decided_at = :now
            WHERE r.crew_id = :crewId AND r.status = 'PENDING'
              AND NOT EXISTS (SELECT 1 FROM crew_expulsions e
                              WHERE e.crew_id = r.crew_id AND e.user_id = r.user_id)
            RETURNING r.id, r.user_id
          ), joined AS (
            INSERT INTO crew_members (crew_id, user_id, joined_at)
            SELECT :crewId, user_id, :now FROM approved
          )
          SELECT id AS requestId, user_id AS userId FROM approved
          """,
      nativeQuery = true)
  List<ApprovedRow> approveAllAdmissible(
      @Param("crewId") UUID crewId, @Param("decidedBy") UUID decidedBy, @Param("now") Instant now);

  @Modifying
  @Query(
      value =
          """
          UPDATE crew_join_requests
          SET rejection_read_at = coalesce(rejection_read_at, :now)
          WHERE id = :id AND user_id = :userId AND status = 'REJECTED'
          """,
      nativeQuery = true)
  int markRejectionRead(
      @Param("id") UUID id, @Param("userId") UUID userId, @Param("now") Instant now);

  interface ApprovedRow {
    UUID getRequestId();

    UUID getUserId();
  }

  @Modifying
  @Query(
      value =
          """
          UPDATE crew_join_requests SET status = 'CANCELED', decided_at = :now
          WHERE crew_id = :crewId AND status = 'PENDING'
          """,
      nativeQuery = true)
  int cancelPendingForCrew(@Param("crewId") UUID crewId, @Param("now") Instant now);

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
