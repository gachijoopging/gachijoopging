-- 처리된 신고는 1년 뒤에야 지워진다. 그동안 같은 대상이 다시 문제가 되어도 신고할 수 있게,
-- 중복 금지를 대기 중 신고에만 건다
ALTER TABLE reports DROP CONSTRAINT reports_reporter_id_target_type_target_id_key;
CREATE UNIQUE INDEX reports_pending_unique ON reports (reporter_id, target_type, target_id)
  WHERE status = 'PENDING';
