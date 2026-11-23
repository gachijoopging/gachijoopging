package site.gachijoopging.server.domain.activity.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import site.gachijoopging.server.domain.activity.entity.ActivityItem;

public interface ActivityItemRepository extends JpaRepository<ActivityItem, UUID> {

  List<ActivityItem> findByActivityIdOrderById(UUID activityId);

  Optional<ActivityItem> findByIdAndActivityId(UUID id, UUID activityId);

  // id 는 앱이 만든다. save() 는 있는 행을 덮어쓰므로 재전송을 흡수하려면 충돌 시 아무것도 하지 않는다.
  // 비어 있을 수 있는 값은 null 의 타입을 DB 가 추론하지 못해 CAST 로 정한다
  @Modifying
  @Query(
      value =
          """
          INSERT INTO activity_items (id, activity_id, photo_id, bbox_x, bbox_y, bbox_w, bbox_h,
                                      ai_predicted_category, ai_confidence, final_category, quantity,
                                      unclassified, source)
          VALUES (:id, :activityId, CAST(:photoId AS uuid),
                  CAST(:bboxX AS real), CAST(:bboxY AS real), CAST(:bboxW AS real), CAST(:bboxH AS real),
                  CAST(:aiPredictedCategory AS text), CAST(:aiConfidence AS real), :finalCategory,
                  :quantity, :unclassified, :source)
          ON CONFLICT (id) DO NOTHING
          """,
      nativeQuery = true)
  void insertIfAbsent(
      @Param("id") UUID id,
      @Param("activityId") UUID activityId,
      @Param("photoId") UUID photoId,
      @Param("bboxX") Float bboxX,
      @Param("bboxY") Float bboxY,
      @Param("bboxW") Float bboxW,
      @Param("bboxH") Float bboxH,
      @Param("aiPredictedCategory") String aiPredictedCategory,
      @Param("aiConfidence") Float aiConfidence,
      @Param("finalCategory") String finalCategory,
      @Param("quantity") int quantity,
      @Param("unclassified") boolean unclassified,
      @Param("source") String source);
}
