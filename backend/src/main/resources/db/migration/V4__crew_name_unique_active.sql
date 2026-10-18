-- 해산한 크루는 소프트 삭제로 행이 남는다. 그 이름까지 막으면 아무도 쓰지 않는 이름을 영영 못 쓰게 되므로,
-- 이름 중복은 살아 있는 크루끼리만 본다 (docs/ERD.md §크루).
ALTER TABLE crews DROP CONSTRAINT crews_name_key;
CREATE UNIQUE INDEX crews_name_active_key ON crews (name) WHERE deleted_at IS NULL;
