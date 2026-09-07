package site.gachijoopging.server.domain.auth.infrastructure.persistence;

import java.time.LocalDate;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.auth.domain.entity.DailyActiveUser;

public interface DailyActiveUserRepository
    extends JpaRepository<DailyActiveUser, DailyActiveUser.Key> {

  @Modifying
  @Query(
      value =
          "INSERT INTO daily_active_users (active_date, user_id) VALUES (:activeDate, :userId)"
              + " ON CONFLICT DO NOTHING",
      nativeQuery = true)
  void record(@Param("activeDate") LocalDate activeDate, @Param("userId") UUID userId);
}
