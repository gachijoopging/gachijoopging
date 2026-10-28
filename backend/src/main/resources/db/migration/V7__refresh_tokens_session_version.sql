-- 발급 시점의 users.session_version. 지금 값과 다르면 refresh 를 거부해, 재설정과 엇갈린 로그인이 세션을 잇지 못하게 한다 (docs/ERD.md §refresh_tokens)
ALTER TABLE refresh_tokens ADD COLUMN session_version integer NOT NULL DEFAULT 0;

-- 기존 행은 발급 시점 버전을 알 수 없어 지금 값을 복사하면 엇갈린 토큰도 통과한다. 폐기하고 재로그인시킨다
UPDATE refresh_tokens SET revoked_at = now() WHERE revoked_at IS NULL;
