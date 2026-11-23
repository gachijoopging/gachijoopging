-- 공개 크루 즉시 가입을 크루장에게 알리고 3-11 크루원 화면으로 보낸다 (feature-scope §알림)
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'JOIN_REQUEST', 'CREW_JOINED', 'JOIN_APPROVED', 'JOIN_REJECTED', 'NOTICE', 'COMMENT', 'CHAT',
  'ACTIVITY_STARTED', 'REPORT', 'REPORT_RESOLVED', 'POST_REMOVED'));

ALTER TABLE notifications DROP CONSTRAINT notifications_target_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_target_type_check CHECK (target_type IN (
  'JOIN_REQUESTS', 'MEMBERS', 'REPORTS', 'POST', 'NOTICE', 'CHAT', 'LIVE', 'CREW', 'NOTIFICATIONS'));
