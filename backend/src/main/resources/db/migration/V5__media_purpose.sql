-- 같은 mediaId 를 다른 용도로 다시 보내면 409 로 막으려면 첫 업로드의 용도를 알아야 한다 (docs/ERD.md §media).
-- 기존 행은 가리키는 곳으로 용도를 채운다. 아무 데도 붙지 않은 행은 게시물용으로 본다.
ALTER TABLE media ADD COLUMN purpose text;

UPDATE media m SET purpose = CASE
  WHEN EXISTS (SELECT 1 FROM activity_photos p WHERE p.media_id = m.id) THEN 'ACTIVITY'
  WHEN EXISTS (SELECT 1 FROM users u WHERE u.photo_media_id = m.id) THEN 'PROFILE'
  WHEN EXISTS (SELECT 1 FROM crews c WHERE c.photo_media_id = m.id) THEN 'CREW'
  ELSE 'POST'
END;

ALTER TABLE media ALTER COLUMN purpose SET NOT NULL;
ALTER TABLE media ADD CONSTRAINT media_purpose_check CHECK (purpose IN ('ACTIVITY', 'POST', 'PROFILE', 'CREW'));
