-- 비밀번호를 재설정하면 이 시각 전에 발급된 accessToken 을 거부한다 (docs/ERD.md §users)
ALTER TABLE users ADD COLUMN password_changed_at timestamptz;
