-- 재설정은 메일로 받은 6자리 코드를 입력하는 방식이다. 코드는 사람 사이에도, 한 사람의 지난 코드와도
-- 겹칠 수 있어 해시가 유일하지 않다 — 행은 user_id 로 찾는다
ALTER TABLE password_reset_tokens DROP CONSTRAINT password_reset_tokens_token_hash_key;

-- 한 코드를 정해진 횟수만큼 틀리면 그 코드를 폐기한다 (openapi.yaml POST /auth/password-reset/confirm)
ALTER TABLE password_reset_tokens ADD COLUMN failed_attempts integer NOT NULL DEFAULT 0;
