-- 초대 코드를 없애고 크루 검색·공개/비공개 가입으로 바꾼다 (docs/ERD.md §크루).
-- 운영 데이터가 없어 기존 크루 행은 지우고 시드로 다시 만든다 — region·join_policy 에 지어낼 기본값을 두지 않기 위해서다.
-- CASCADE 는 crews 를 직간접으로 참조하는 테이블(활동·위치·피드·공지·채팅·신고·통계와 그 하위 행)을 모두 비운다.
TRUNCATE crews CASCADE;

ALTER TABLE crews DROP COLUMN invite_code;
ALTER TABLE crews ADD COLUMN region text NOT NULL CHECK (region IN (
  'SEOUL', 'BUSAN', 'DAEGU', 'INCHEON', 'GWANGJU', 'DAEJEON', 'ULSAN', 'SEJONG', 'GYEONGGI',
  'GANGWON', 'CHUNGBUK', 'CHUNGNAM', 'JEONBUK', 'JEONNAM', 'GYEONGBUK', 'GYEONGNAM', 'JEJU'));
ALTER TABLE crews ADD COLUMN join_policy text NOT NULL CHECK (join_policy IN ('OPEN', 'APPROVAL'));

ALTER TABLE crew_join_requests ADD COLUMN rejection_read_at timestamptz;

CREATE TABLE crew_expulsions (
  crew_id     uuid        NOT NULL REFERENCES crews (id),
  user_id     uuid        NOT NULL REFERENCES users (id),
  expelled_by uuid        NOT NULL REFERENCES users (id),
  expelled_at timestamptz NOT NULL,
  PRIMARY KEY (crew_id, user_id)
);
