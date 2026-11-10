-- 지운 메시지를 물리 삭제해도 seq 가 되돌아가지 않게 크루별 마지막 seq 를 메시지와 따로 둔다.
-- 되돌아가면 다음 메시지가 이미 읽은 번호를 받아 읽음으로 계산되고 앱의 이어 받기에서 빠진다
CREATE TABLE chat_seqs (
  crew_id  uuid   PRIMARY KEY REFERENCES crews (id),
  last_seq bigint NOT NULL
);

INSERT INTO chat_seqs (crew_id, last_seq)
SELECT crew_id, max(seq) FROM chat_messages GROUP BY crew_id;
