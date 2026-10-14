package site.gachijoopging.server.domain.crew.repository;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.crew.entity.Crew;

public interface CrewRepository extends JpaRepository<Crew, UUID> {

  Optional<Crew> findByIdAndDeletedAtIsNull(UUID id);

  // 정원은 세고 넣는 두 단계라 같은 크루에 크루원을 넣는 트랜잭션끼리 줄 세운다 (ERD "크루 정원")
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("SELECT c FROM Crew c WHERE c.id = :id AND c.deletedAt IS NULL")
  Optional<Crew> findActiveForUpdate(@Param("id") UUID id);

  boolean existsByNameAndDeletedAtIsNull(String name);

  boolean existsByNameAndIdNotAndDeletedAtIsNull(String name, UUID id);

  @Modifying
  @Query(
      value =
          """
          INSERT INTO crews (id, name, intro, leader_id, region, join_policy, created_at, updated_at)
          VALUES (:id, :name, :intro, :leaderId, :region, :joinPolicy, :now, :now)
          ON CONFLICT DO NOTHING
          """,
      nativeQuery = true)
  int insertIfAbsent(
      @Param("id") UUID id,
      @Param("name") String name,
      @Param("intro") String intro,
      @Param("leaderId") UUID leaderId,
      @Param("region") String region,
      @Param("joinPolicy") String joinPolicy,
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

  @Query(
      value =
          "SELECT EXISTS (SELECT 1 FROM crew_expulsions WHERE crew_id = :crewId AND user_id = :userId)",
      nativeQuery = true)
  boolean wasExpelled(@Param("crewId") UUID crewId, @Param("userId") UUID userId);

  @Query(
      value =
          "SELECT EXISTS (SELECT 1 FROM crew_members WHERE crew_id = :crewId AND user_id = :userId)",
      nativeQuery = true)
  boolean isMember(@Param("crewId") UUID crewId, @Param("userId") UUID userId);

  @Modifying
  @Query(
      value = "DELETE FROM crew_members WHERE crew_id = :crewId AND user_id = :userId",
      nativeQuery = true)
  int deleteMember(@Param("crewId") UUID crewId, @Param("userId") UUID userId);

  @Modifying
  @Query(
      value =
          """
          INSERT INTO crew_expulsions (crew_id, user_id, expelled_by, expelled_at)
          VALUES (:crewId, :userId, :expelledBy, :now)
          ON CONFLICT (crew_id, user_id)
          DO UPDATE SET expelled_by = EXCLUDED.expelled_by, expelled_at = EXCLUDED.expelled_at
          """,
      nativeQuery = true)
  void recordExpulsion(
      @Param("crewId") UUID crewId,
      @Param("userId") UUID userId,
      @Param("expelledBy") UUID expelledBy,
      @Param("now") Instant now);

  @Query(
      value =
          """
          SELECT EXISTS (SELECT 1 FROM activities
                         WHERE user_id = :userId AND status = 'IN_PROGRESS' AND deleted_at IS NULL)
          """,
      nativeQuery = true)
  boolean hasActivityInProgress(@Param("userId") UUID userId);

  interface MembershipRow {
    UUID getCrewId();

    UUID getLeaderId();
  }
}
