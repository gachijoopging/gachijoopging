# DB 는 Supabase 의 Postgres 만 쓴다

EC2 안의 PostGIS 컨테이너를 운영하면서 백업·디스크·모니터링을 서비스보다 더 많이 돌봐야 했다.
Supabase 가 관리하는 Postgres(PostGIS 포함)를 쓰고, Spring 은 지금처럼 JDBC 로 붙는다.
Supabase 의 Auth·Storage·Realtime 은 쓰지 않는다 — 인증과 채팅 소켓은 이미 Spring 에 있고, 두 곳에 나누면
권한 규칙이 갈라진다. 리전은 EC2 와 같은 서울로 맞춘다.

## 고려한 대안

- EC2 Postgres 유지: 비용은 0 이지만 백업이 사람 손에 달려 있었다
- Supabase 를 백엔드 전체로(Auth·Row Level Security·Edge Functions): Spring 코드를 대부분 버려야 하고, 크루장 권한 같은 규칙을 SQL 정책으로 다시 써야 한다
