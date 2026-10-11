package site.gachijoopging.server.domain.user.repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.user.entity.User;

public interface UserQueryRepository extends Repository<User, UUID> {

  @Query(
      value =
          """
          SELECT c.id AS crewId, c.name AS crewName, c.leader_id AS leaderId
          FROM crew_members m JOIN crews c ON c.id = m.crew_id
          WHERE m.user_id = :userId AND c.deleted_at IS NULL
          """,
      nativeQuery = true)
  Optional<MembershipRow> findMembership(@Param("userId") UUID userId);

  @Query(
      value =
          """
          SELECT c.id AS crewId, c.name AS crewName, c.leader_id AS leaderId
          FROM crew_join_requests r JOIN crews c ON c.id = r.crew_id
          WHERE r.user_id = :userId AND r.status = 'PENDING' AND c.deleted_at IS NULL
          """,
      nativeQuery = true)
  Optional<MembershipRow> findPendingCrew(@Param("userId") UUID userId);

  // 가장 최근 신청만 본다 — 그보다 오래된 미확인 거절은 다시 띄우지 않는다
  @Query(
      value =
          """
          SELECT r.id AS requestId, c.id AS crewId, c.name AS crewName, r.decided_at AS decidedAt
          FROM (
            SELECT * FROM crew_join_requests WHERE user_id = :userId
            ORDER BY created_at DESC, id DESC LIMIT 1
          ) r JOIN crews c ON c.id = r.crew_id
          WHERE r.status = 'REJECTED' AND r.rejection_read_at IS NULL
          """,
      nativeQuery = true)
  Optional<RejectionRow> findUnreadRejection(@Param("userId") UUID userId);

  interface RejectionRow {
    UUID getRequestId();

    UUID getCrewId();

    String getCrewName();

    Instant getDecidedAt();
  }

  interface MembershipRow {
    UUID getCrewId();

    String getCrewName();

    UUID getLeaderId();
  }
}
