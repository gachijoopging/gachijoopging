package site.gachijoopging.server.domain.crew.repository;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.crew.entity.Crew;

public interface CrewQueryRepository extends Repository<Crew, UUID> {

  @Query(
      value =
          """
          SELECT u.id AS id, u.nickname AS nickname, u.photo_media_id AS photoMediaId,
                 u.status AS status
          FROM users u WHERE u.id = :userId
          """,
      nativeQuery = true)
  UserBriefRow findUserBrief(@Param("userId") UUID userId);

  // 검색어의 % _ 를 와일드카드로 읽지 않도록 LIKE 대신 strpos 로 부분 일치를 본다
  @Query(
      value =
          """
          SELECT c.id AS id, c.name AS name, c.intro AS intro, c.photo_media_id AS photoMediaId,
                 c.region AS region, c.join_policy AS joinPolicy, c.leader_id AS leaderId,
                 u.nickname AS leaderNickname, u.photo_media_id AS leaderPhotoMediaId,
                 u.status AS leaderStatus,
                 (SELECT count(*) FROM crew_members m WHERE m.crew_id = c.id) AS memberCount
          FROM crews c JOIN users u ON u.id = c.leader_id
          WHERE c.deleted_at IS NULL
            AND (CAST(:query AS text) IS NULL OR strpos(lower(c.name), lower(CAST(:query AS text))) > 0)
            AND (CAST(:region AS text) IS NULL OR c.region = CAST(:region AS text))
            AND (CAST(:afterName AS text) IS NULL OR c.name > CAST(:afterName AS text))
          ORDER BY c.name
          LIMIT :limit
          """,
      nativeQuery = true)
  List<CrewSummaryRow> search(
      @Param("query") String query,
      @Param("region") String region,
      @Param("afterName") String afterName,
      @Param("limit") int limit);

  interface CrewSummaryRow {
    UUID getId();

    String getName();

    String getIntro();

    UUID getPhotoMediaId();

    String getRegion();

    String getJoinPolicy();

    UUID getLeaderId();

    String getLeaderNickname();

    UUID getLeaderPhotoMediaId();

    String getLeaderStatus();

    int getMemberCount();
  }

  interface UserBriefRow {
    UUID getId();

    String getNickname();

    UUID getPhotoMediaId();

    String getStatus();
  }
}
