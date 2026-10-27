package site.gachijoopging.server.domain.user.entity;

import static java.util.Objects.requireNonNull;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User {

  @Id private UUID id;

  private String email;

  @Column(name = "password_hash")
  private String passwordHash;

  @Column(name = "kakao_id")
  private String kakaoId;

  @Column(name = "google_sub")
  private String googleSub;

  private String nickname;

  @Column(nullable = false)
  private String intro;

  @Column(name = "photo_media_id")
  private UUID photoMediaId;

  @Column(name = "share_location_default", nullable = false)
  private boolean shareLocationDefault;

  @Column(name = "notify_activity_start", nullable = false)
  private boolean notifyActivityStart;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false)
  private UserStatus status;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  @Column(name = "deleted_at")
  private Instant deletedAt;

  @Column(name = "session_version", nullable = false)
  private int sessionVersion;

  public boolean active() {
    return status == UserStatus.ACTIVE;
  }

  public boolean profileComplete() {
    return nickname != null;
  }

  public void linkKakao(String kakaoId, Instant now) {
    this.kakaoId = requireNonNull(kakaoId, "kakaoId");
    this.updatedAt = now;
  }

  public void linkGoogle(String googleSub, Instant now) {
    this.googleSub = requireNonNull(googleSub, "googleSub");
    this.updatedAt = now;
  }

  public void updateProfile(
      String nickname,
      String intro,
      Optional<UUID> photoMediaId,
      Boolean shareLocationDefault,
      Boolean notifyActivityStart,
      Instant now) {
    if (nickname != null) {
      this.nickname = nickname;
    }
    if (intro != null) {
      this.intro = intro;
    }
    if (photoMediaId != null) {
      this.photoMediaId = photoMediaId.orElse(null);
    }
    if (shareLocationDefault != null) {
      this.shareLocationDefault = shareLocationDefault;
    }
    if (notifyActivityStart != null) {
      this.notifyActivityStart = notifyActivityStart;
    }
    this.updatedAt = now;
  }

  public void changePassword(String passwordHash, Instant now) {
    this.passwordHash = requireNonNull(passwordHash, "passwordHash");
    this.sessionVersion++;
    this.updatedAt = now;
  }
}
