package site.gachijoopging.server.domain.crew.repository;

import java.sql.Date;
import java.time.Instant;
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

  // 통계는 지금 크루에서 끝낸 활동만 센다 — 이전 크루 기록은 남에게 보이지 않는다
  // 가나다순은 COLLATE "C" 로 낸다. 한글 음절은 코드 순서가 가나다순이고, DB 기본 collation 은 환경마다 한글을 다르게(무시하기도) 정렬한다
  @Query(
      value =
          """
          SELECT u.id AS id, u.nickname AS nickname, u.photo_media_id AS photoMediaId,
                 u.status AS status, u.intro AS intro, m.joined_at AS joinedAt,
                 (u.id = c.leader_id) AS leader,
                 EXISTS (SELECT 1 FROM follows f
                         WHERE f.follower_id = :me AND f.followee_id = u.id) AS following,
                 EXISTS (SELECT 1 FROM blocks b
                         WHERE b.blocker_id = :me AND b.blocked_id = u.id) AS blocked,
                 coalesce(a.items, 0) AS totalItems, coalesce(a.distance, 0) AS totalDistanceM,
                 coalesce(a.activities, 0) AS totalActivities
          FROM crew_members m
          JOIN crews c ON c.id = m.crew_id
          JOIN users u ON u.id = m.user_id
          LEFT JOIN (
            SELECT user_id, sum(item_count) AS items, sum(distance_m) AS distance,
                   count(*) AS activities
            FROM activities
            WHERE crew_id = :crewId AND status = 'ENDED' AND deleted_at IS NULL
            GROUP BY user_id
          ) a ON a.user_id = u.id
          WHERE m.crew_id = :crewId AND (CAST(:userId AS uuid) IS NULL OR u.id = CAST(:userId AS uuid))
          ORDER BY (u.id = c.leader_id) DESC, u.nickname COLLATE "C", u.id
          """,
      nativeQuery = true)
  List<MemberRow> findMembers(
      @Param("crewId") UUID crewId, @Param("me") UUID me, @Param("userId") UUID userId);

  @Query(
      value =
          """
          SELECT DISTINCT CAST(started_at AT TIME ZONE 'Asia/Seoul' AS date) AS day
          FROM activities
          WHERE crew_id = :crewId AND user_id = :userId AND status = 'ENDED'
            AND deleted_at IS NULL AND started_at >= :since
          ORDER BY day DESC
          """,
      nativeQuery = true)
  List<Date> findActiveDays(
      @Param("crewId") UUID crewId, @Param("userId") UUID userId, @Param("since") Instant since);

  interface MemberRow {
    UUID getId();

    String getNickname();

    UUID getPhotoMediaId();

    String getStatus();

    String getIntro();

    Instant getJoinedAt();

    boolean getLeader();

    boolean getFollowing();

    boolean getBlocked();

    long getTotalItems();

    long getTotalDistanceM();

    long getTotalActivities();
  }

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
