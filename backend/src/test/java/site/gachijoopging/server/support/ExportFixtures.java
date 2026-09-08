package site.gachijoopging.server.support;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import site.gachijoopging.server.support.TestAccounts.TestAccount;

public final class ExportFixtures {

  public static final ZoneId KST = ZoneId.of("Asia/Seoul");

  private final JdbcTemplate jdbc;

  public ExportFixtures(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public TestAccount 관리자를_만든다(MockMvc mockMvc) throws Exception {
    TestAccount 계정 = TestAccounts.가입한다(mockMvc, "boss-" + UUID.randomUUID() + "@export.test");
    jdbc.update("UPDATE users SET role = 'ADMIN' WHERE id = ?", 계정.id());
    return 계정;
  }

  public UUID 닉네임을_붙인다(UUID 사용자, String 닉네임) {
    jdbc.update("UPDATE users SET nickname = ? WHERE id = ?", 닉네임, 사용자);
    return 사용자;
  }

  public String 고유한_동네이름() {
    return "동" + UUID.randomUUID().toString().substring(0, 8);
  }

  public UUID 활동을_만든다(Instant 삭제_시각) {
    return 활동을_만든다(삭제_시각, "PERSONAL");
  }

  public UUID 활동을_만든다(Instant 삭제_시각, String 종류) {
    UUID 사용자 = jdbc.queryForObject("INSERT INTO users DEFAULT VALUES RETURNING id", UUID.class);
    UUID id = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO activities
          (id, user_id, type, started_at, ended_at, duration_sec, distance_m,
           gps_weak, location_shared, deleted_at)
        VALUES (?, ?, ?, now(), now(), 0, 0, false, true, ?)
        """,
        id,
        사용자,
        종류,
        삭제_시각 == null ? null : Timestamp.from(삭제_시각));
    return id;
  }

  public UUID 사진에_항목을_넣는다(UUID 활동, LocalDate 촬영일, String 동네, String 품목, int 개수) {
    return 사진에_항목을_넣는다(활동, 촬영일.atTime(12, 0).atZone(KST).toInstant(), 동네, 품목, 개수, null, null, null);
  }

  public UUID 사진에_항목을_넣는다(
      UUID 활동, Instant 촬영시각, String 동네, String 품목, int 개수, Double 위도, Double 경도, String 시군구) {
    UUID 사진 = UUID.randomUUID();
    jdbc.update(
        """
        INSERT INTO activity_photos
          (id, activity_id, media_id, taken_at, point, sido, sigungu, dong,
           inference_source, order_index)
        VALUES (?, ?, ?, ?,
                CASE WHEN CAST(? AS double precision) IS NULL THEN NULL
                     ELSE ST_SetSRID(
                       ST_MakePoint(CAST(? AS double precision),
                                    CAST(? AS double precision)), 4326) END,
                ?, ?, ?, 'MANUAL', 0)
        """,
        사진,
        활동,
        미디어를_만든다(),
        Timestamp.from(촬영시각),
        위도,
        경도,
        위도,
        시군구 == null ? null : "서울특별시",
        시군구,
        동네);
    항목을_단다(사진, 활동, 품목, 개수);
    return 사진;
  }

  public void 항목을_단다(UUID 사진, UUID 활동, String 품목, int 개수) {
    for (int i = 0; i < 개수; i++) {
      jdbc.update(
          """
          INSERT INTO activity_items
            (photo_id, activity_id, bbox_x, bbox_y, bbox_w, bbox_h,
             final_category, unclassified, source)
          VALUES (?, ?, 0.1, 0.1, 0.2, 0.2, ?, false, 'MANUAL')
          """,
          사진,
          활동,
          품목);
    }
  }

  private UUID 미디어를_만든다() {
    UUID 소유자 = jdbc.queryForObject("INSERT INTO users DEFAULT VALUES RETURNING id", UUID.class);
    UUID 미디어 = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO media (id, owner_id, object_key, thumb_key) VALUES (?, ?, 'o', 't')",
        미디어,
        소유자);
    return 미디어;
  }
}
