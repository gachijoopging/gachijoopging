# 운영

EC2 한 대 + Supabase Postgres + 담당자 노트북의 AI 서버. 컨테이너 4개(`feature-scope.md` 인프라 행).

## 구성 — 미결

옛 EC2 구성(nginx·blue/green·acme·redis·Postgres 컨테이너·LiveKit·모니터링)은 가져오지 않았다. 서버는 새로 구성하며 플랫폼·배포·감시 방식은 아직 정하지 않았다(`feature-scope.md` 미결).
정해진 것: DB 는 Supabase Postgres(ADR-0001), 공개 주소는 `www.gachi-joopging.site`(apex 는 301 이라 쓰지 않는다), 채팅·위치는 STOMP 소켓(`realtime.md`)이라 소켓을 통과시키는 입구가 필요하다.

## `.env` 키

실물은 EC2 의 `/opt/gachijoopging/infra/.env` 한 곳. 저장소에는 `infra/.env.example` 만.

| 키 | 용도 |
|---|---|
| `DOCKERHUB_USER` · `IMAGE_TAG` | 이미지 좌표. `IMAGE_TAG` 는 deploy.sh 가 갱신 |
| `PUBLIC_BASE_URL` | 서명 URL·메일 링크의 기준 |
| `DATABASE_URL` · `DATABASE_USER` · `DATABASE_PASSWORD` | Supabase 접속. 옛 `POSTGRES_*` 는 컨테이너용이라 없어진다 |
| `JWT_ACTIVE_KID` · `JWT_PRIVATE_KEY_PEM` · `JWT_PUBLIC_KEY_PEM` · `JWT_PREVIOUS_*` | 토큰 서명. kid 회전용 이전 키 |
| `KAKAO_REST_API_KEY` · `KAKAO_APP_ID` · `GOOGLE_CLIENT_ID` | 소셜 토큰 검증 |
| `MEDIA_SECURE_LINK_SECRET` | 사진 서명 URL |
| `MAIL_USERNAME` · `MAIL_PASSWORD` | 비밀번호 재설정 메일 |
| `FCM_CREDENTIALS` | 푸시 |
| `AI_BASE_URL` · `AI_SECRET` | AI 서버 |
| `CERT_DOMAIN` · `CERT_EMAIL` | acme |

없어지는 키: `LIVEKIT_*` · `GRAFANA_ADMIN_PASSWORD` · `ADMIN_WEB_TAG` · `POSTGRES_*`.

푸시(FCM)는 Firebase 프로젝트 `gachi-joopging`, Android 패키지 `site.gachijoopging.app` 으로 등록돼 있다. `google-services.json` 은 Firebase 콘솔에서 내려받는다.

`.env` 를 고칠 때는 **바이너리로 다룬다.** PEM 값에 CR 이 섞이면 docker compose 는 통과시키고 Spring 만 `Missing key encoding` 으로 죽는다. Windows 편집기로 열지 않고 `dev-env.ps1` 같은 스크립트로 올린다.

## `mobile/.env` 키 (앱)

위 표는 서버(`infra/.env`)다. 앱은 별도이며 각자 로컬에만 둔다 — `.gitignore` 가 막는다.

| 키 | 용도 |
|---|---|
| `KAKAO_NATIVE_APP_KEY` | 카카오맵 SDK 초기화. 없으면 지도 화면이 안내 배너만 띄운다 |

카카오 개발자 콘솔에서 앱에 `site.gachijoopging.app` 과 키 해시가 등록돼 있어야 지도가 뜬다.

## 개인정보

- 위치 경로(`activities.route`)와 실시간 위치(`live_locations`)는 위치 정보다. 실시간 위치는 활동 종료 때 즉시 지운다
- 회원 탈퇴 때 개인 활동 상세(경로·사진 포함)를 지운다. 크루 합산은 `crew_daily_stats` 에 남는다(`ERD.md`)
- 사진은 서명 URL 로만 노출한다. 공개 버킷을 만들지 않는다
- 로그에 토큰·이메일·좌표를 남기지 않는다

## 스토어

- Android: `release.jks` 와 비밀번호는 저장소 밖(`local.properties`). 잃으면 덮어설치가 불가능하다
- iOS: 1차 범위 밖. 넣을 때 Apple 개발자 계정·서명·TestFlight 절차를 여기에 적는다
