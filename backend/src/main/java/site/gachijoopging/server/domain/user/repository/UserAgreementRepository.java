package site.gachijoopging.server.domain.user.repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.user.entity.UserAgreement;

public interface UserAgreementRepository extends JpaRepository<UserAgreement, UserAgreement.Key> {

  List<UserAgreement> findByUserIdAndVersion(UUID userId, String version);

  // 같은 내용 재전송은 agreed_at 을 바꾸지 않는다 — 동의 시각이 재전송 시각으로 밀리면 안 된다
  @Modifying(clearAutomatically = true)
  @Query(
      value =
          """
          INSERT INTO user_agreements (user_id, type, version, agreed, agreed_at)
          VALUES (:userId, :type, :version, :agreed, :now)
          ON CONFLICT (user_id, type, version) DO UPDATE
            SET agreed = EXCLUDED.agreed, agreed_at = EXCLUDED.agreed_at
            WHERE user_agreements.agreed IS DISTINCT FROM EXCLUDED.agreed
          """,
      nativeQuery = true)
  void upsert(
      @Param("userId") UUID userId,
      @Param("type") String type,
      @Param("version") String version,
      @Param("agreed") boolean agreed,
      @Param("now") Instant now);
}
