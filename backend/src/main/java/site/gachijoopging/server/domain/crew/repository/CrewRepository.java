package site.gachijoopging.server.domain.crew.repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.crew.entity.Crew;

public interface CrewRepository extends JpaRepository<Crew, UUID> {

  Optional<Crew> findByIdAndDeletedAtIsNull(UUID id);

  Optional<Crew> findByInviteCodeAndDeletedAtIsNull(String inviteCode);

  boolean existsByName(String name);

  boolean existsByNameAndIdNot(String name, UUID id);

  @Modifying
  @Query(
      value =
          """
          INSERT INTO crews (id, name, leader_id, invite_code, created_at, updated_at)
          VALUES (:id, :name, :leaderId, :inviteCode, :now, :now)
          ON CONFLICT DO NOTHING
          """,
      nativeQuery = true)
  int insertIfAbsent(
      @Param("id") UUID id,
      @Param("name") String name,
      @Param("leaderId") UUID leaderId,
      @Param("inviteCode") String inviteCode,
      @Param("now") Instant now);

  @Modifying
  @Query(
      value =
          """
          INSERT INTO crew_members (crew_id, user_id, joined_at)
          VALUES (:crewId, :userId, :now)
          ON CONFLICT DO NOTHING
          """,
      nativeQuery = true)
  int insertMemberIfAbsent(
      @Param("crewId") UUID crewId, @Param("userId") UUID userId, @Param("now") Instant now);

  @Query(
      value =
          """
          SELECT c.id AS crewId, c.leader_id AS leaderId
          FROM crew_members m JOIN crews c ON c.id = m.crew_id
          WHERE m.user_id = :userId AND c.deleted_at IS NULL
          """,
      nativeQuery = true)
  Optional<MembershipRow> findMembership(@Param("userId") UUID userId);

  @Query(value = "SELECT count(*) FROM crew_members WHERE crew_id = :crewId", nativeQuery = true)
  int countMembers(@Param("crewId") UUID crewId);

  @Query(
      value =
          "SELECT count(*) FROM crew_join_requests WHERE crew_id = :crewId AND status = 'PENDING'",
      nativeQuery = true)
  int countPendingJoinRequests(@Param("crewId") UUID crewId);

  interface MembershipRow {
    UUID getCrewId();

    UUID getLeaderId();
  }
}
