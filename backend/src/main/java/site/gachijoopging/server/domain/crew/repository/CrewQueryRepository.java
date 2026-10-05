package site.gachijoopging.server.domain.crew.repository;

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

  interface UserBriefRow {
    UUID getId();

    String getNickname();

    UUID getPhotoMediaId();

    String getStatus();
  }
}
