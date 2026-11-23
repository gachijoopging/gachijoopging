package site.gachijoopging.server.domain.user.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

// 쓰기는 UserAgreementRepository.upsert 하나뿐이라 생성자를 두지 않는다
@Entity
@Table(name = "user_agreements")
@IdClass(UserAgreement.Key.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserAgreement {

  @Id
  @Column(name = "user_id")
  private UUID userId;

  @Id
  @Enumerated(EnumType.STRING)
  private AgreementType type;

  @Id private String version;

  @Column(nullable = false)
  private boolean agreed;

  @Column(name = "agreed_at", nullable = false)
  private Instant agreedAt;

  public record Key(UUID userId, AgreementType type, String version) implements Serializable {}
}
