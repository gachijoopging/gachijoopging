-- 발급 시점의 users.session_version. 지금 값과 다르면 refresh 를 거부해, 재설정과 엇갈린 로그인이 세션을 잇지 못하게 한다 (docs/ERD.md §refresh_tokens)
ALTER TABLE refresh_tokens ADD COLUMN session_version integer NOT NULL DEFAULT 0;

UPDATE refresh_tokens r SET session_version = u.session_version FROM users u WHERE r.user_id = u.id;
