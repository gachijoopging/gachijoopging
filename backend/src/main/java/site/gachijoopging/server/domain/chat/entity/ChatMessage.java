package site.gachijoopging.server.domain.chat.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "chat_messages")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatMessage {

  @Id private UUID id;

  @Column(nullable = false)
  private UUID crewId;

  @Column(nullable = false)
  private long seq;

  @Column(nullable = false)
  private UUID authorId;

  @Column(nullable = false)
  private String text;

  @Column(nullable = false)
  private Instant createdAt;

  private Instant deletedAt;

  private UUID deletedBy;

  public boolean sentBy(UUID userId, UUID crewId) {
    return authorId.equals(userId) && this.crewId.equals(crewId);
  }
}
