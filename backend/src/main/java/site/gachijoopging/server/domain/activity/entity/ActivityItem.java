package site.gachijoopging.server.domain.activity.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "activity_items")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ActivityItem {

  @Id private UUID id;

  @Column(name = "activity_id", nullable = false)
  private UUID activityId;

  @Column(name = "photo_id")
  private UUID photoId;

  @Column(name = "bbox_x")
  private Float bboxX;

  @Column(name = "bbox_y")
  private Float bboxY;

  @Column(name = "bbox_w")
  private Float bboxW;

  @Column(name = "bbox_h")
  private Float bboxH;

  @Enumerated(EnumType.STRING)
  @Column(name = "ai_predicted_category")
  private Category aiPredictedCategory;

  @Column(name = "ai_confidence")
  private Float aiConfidence;

  @Enumerated(EnumType.STRING)
  @Column(name = "final_category", nullable = false)
  private Category finalCategory;

  @Column(nullable = false)
  private int quantity;

  @Column(nullable = false)
  private boolean unclassified;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private ItemSource source;

  public void change(Category category, Integer quantity) {
    if (category != null) {
      this.finalCategory = category;
    }
    if (quantity != null) {
      this.quantity = quantity;
    }
  }
}
