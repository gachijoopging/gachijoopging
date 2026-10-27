-- 비밀번호를 재설정하면 올린다. 토큰에 실린 값과 다르면 accessToken 을 거부한다 (docs/ERD.md §users)
ALTER TABLE users ADD COLUMN session_version integer NOT NULL DEFAULT 0;
