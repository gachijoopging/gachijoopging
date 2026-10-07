package site.gachijoopging.server.domain.user.repository;

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

  interface MembershipRow {
    UUID getCrewId();

    String getCrewName();

    UUID getLeaderId();
  }
}
