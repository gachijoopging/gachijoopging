-- 데모 크루 두 개에 딸린 행을 FK 순서대로 지운다. 계정은 고정 id 로 다시 쓰이므로 남긴다(동의·비밀번호 유지).
-- crew_daily_stats 는 고정 id 가 없는 합계라, 활동만 지우고 남기면 재시드 때 두 배로 쌓인다 — 함께 지운다.
BEGIN;

CREATE TEMP TABLE demo_crews ON COMMIT DROP AS
SELECT id FROM crews WHERE name IN ('가치줍깅 데모크루', '가치줍깅 비공개크루');

DELETE FROM comments WHERE post_id IN (SELECT id FROM posts WHERE crew_id IN (SELECT id FROM demo_crews));
DELETE FROM post_likes WHERE post_id IN (SELECT id FROM posts WHERE crew_id IN (SELECT id FROM demo_crews));
DELETE FROM post_media WHERE post_id IN (SELECT id FROM posts WHERE crew_id IN (SELECT id FROM demo_crews));
DELETE FROM posts WHERE crew_id IN (SELECT id FROM demo_crews);
DELETE FROM notice_comments WHERE notice_id IN (SELECT id FROM notices WHERE crew_id IN (SELECT id FROM demo_crews));
DELETE FROM notices WHERE crew_id IN (SELECT id FROM demo_crews);
DELETE FROM chat_reads WHERE crew_id IN (SELECT id FROM demo_crews);
DELETE FROM chat_messages WHERE crew_id IN (SELECT id FROM demo_crews);
DELETE FROM reports WHERE crew_id IN (SELECT id FROM demo_crews);
DELETE FROM activities WHERE crew_id IN (SELECT id FROM demo_crews);
DELETE FROM crew_daily_stats WHERE crew_id IN (SELECT id FROM demo_crews);
DELETE FROM crew_join_requests WHERE crew_id IN (SELECT id FROM demo_crews);
DELETE FROM crew_expulsions WHERE crew_id IN (SELECT id FROM demo_crews);
DELETE FROM crew_members WHERE crew_id IN (SELECT id FROM demo_crews);
DELETE FROM crews WHERE id IN (SELECT id FROM demo_crews);

COMMIT;
