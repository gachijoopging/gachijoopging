# 운영

Lightsail VM 한 대 + Supabase Postgres + 담당자 노트북의 AI 서버.

## 구성

VM 한 대에 docker compose 로 컨테이너 셋을 띄운다 — 백엔드(Spring)·Redis·Nginx. 근거는 ADR-0005.
옛 EC2 구성(blue/green·Postgres 컨테이너·LiveKit·모니터링)은 가져오지 않았다.

| | |
|---|---|
| 호스트 | AWS Lightsail 서울 · 2GB 번들(2 vCPU · 60GB SSD · 전송량 3TB) · Ubuntu 24.04 LTS |
| 지금 있는 것 | **스테이징 한 대뿐이다.** 운영은 첫 사용자를 받기 전에 새로 만든다(ADR-0005). 스테이징은 `staging.` 서브도메인과 별도 Supabase 프로젝트를 쓴다 |
| 고정 IP | 번들에 포함. 붙여 두지 않으면 재시작마다 주소가 바뀐다 |
| 스왑 | 2GB(`/swapfile`). 없으면 램이 찰 때 OOM Killer 가 가장 큰 프로세스 — 즉 백엔드 — 를 죽인다 |
| 공개 주소 | `www.gachi-joopging.site`(apex 는 301 이라 쓰지 않는다) |
| 입구 | Nginx 가 443 을 잡고 `/api/v1/...` 를 백엔드로, 사진을 디스크에서 직접 보낸다. 채팅·위치가 STOMP 소켓(`realtime.md`)이라 WebSocket 업그레이드를 통과시킨다 |
| DB | Supabase Postgres(PostGIS) · 서울 (ADR-0001) |
| AI | 담당자 GPU 노트북 + 터널. 서버에 올리지 않는다 (`ai/README.md` §8) |

## 배포

`dev` 머지가 스테이징, `main` 머지가 운영이다(`docs/conventions.md` §브랜치 전략).

이미지는 한 번만 만든다. 스테이징에서 쓴 이미지의 **태그만 승격**하고 다시 빌드하지 않는다 — 다시 빌드하면
그 사이 바뀐 의존성이 섞여, 검증한 것과 다른 물건이 운영에 올라간다. 롤백은 직전 `IMAGE_TAG` 로 되돌리는
한 명령이다.

그래서 **환경에 따라 달라지는 값은 이미지에 굽지 않는다.** 주소·자격증명은 전부 `infra/.env` 로 주입한다.
`application.yml` 에서 `${PUBLIC_BASE_URL:...}` 처럼 쓰인 것이 그 모양이고, 콜론 뒤는 값이 없을 때의
기본값일 뿐이다. 주소를 `${}` 없이 적으면 그 순간 태그 승격이 깨져 스테이징에서 보낸 메일이 운영을
가리킨다. 키 1:1 대조는 GAC-99.

## 감시

헬스체크와 바깥에서 찌르는 것, 둘을 함께 쓴다. 서버가 통째로 꺼지면 자기 자신에게 묻는 헬스체크도 같이
죽어서 아무도 모르기 때문이다.

| 층 | 무엇 | 잡는 것 |
|---|---|---|
| 서버 안 | `/actuator/health`(readiness·liveness) | 백엔드 프로세스·DB 연결 |
| 바깥 | 외부 모니터링이 공개 주소를 주기적으로 호출 | 전원·네트워크·인증서 만료 |
| 알림 | `node infra/notify.mjs` 로 Mattermost | — |

**Prometheus·Grafana 는 되살리지 않는다.** 옛 구성에 있었고 `application.yml` 에 아직
`/actuator/prometheus` 노출이 남아 있지만, 3명이 쓰는 규모에서 그래프를 보는 사람이 없다. 수집기만
나중에 붙이면 되도록 노출은 그대로 둔다.

## `.env` 키

실물은 서버의 `/opt/gachijoopging/infra/.env` 한 곳. 저장소에는 `infra/.env.example` 만.

| 키 | 용도 |
|---|---|
| `DOCKERHUB_USER` · `IMAGE_TAG` | 이미지 좌표. `IMAGE_TAG` 는 deploy.sh 가 갱신 |
| `PUBLIC_BASE_URL` | 서명 URL·메일 링크의 기준 |
| `DATABASE_URL` · `DATABASE_USER` · `DATABASE_PASSWORD` | Supabase 접속. 옛 `POSTGRES_*` 는 컨테이너용이라 없어진다 |
| `JWT_ACTIVE_KID` · `JWT_PRIVATE_KEY_PEM` · `JWT_PUBLIC_KEY_PEM` · `JWT_PREVIOUS_*` | 토큰 서명. kid 회전용 이전 키 |
| `KAKAO_REST_API_KEY` · `KAKAO_APP_ID` · `GOOGLE_CLIENT_ID` | 소셜 토큰 검증 |
| `MEDIA_SECURE_LINK_SECRET` | 사진 서명 URL |
| `MAIL_USERNAME` · `MAIL_PASSWORD` | 비밀번호 재설정 메일 |
| `AGREEMENTS_VERSION` · `TERMS_URL` · `PRIVACY_URL` · `MARKETING_URL` | 현재 동의 버전과 공개 전문 URL. 모두 설정해야 동의 API가 제공된다. 전문 정본은 `docs/legal/` 이고 버전은 각 문서 머리의 값(지금 `2026-10`). 정식 주소 `www.gachi-joopging.site/{terms,privacy,marketing}` 가 서빙되기 전까지는 `https://djm030.github.io/gachijoopging-legal/{terms,privacy,marketing}` 를 넣는다. 정식 주소 전환과 전문의 빈칸(문의 이메일·리전)은 GAC-80 |
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

카카오 개발자 콘솔 → 앱 설정 → 플랫폼 → Android 에 **패키지명과 키 해시**가 등록돼 있어야 지도가 뜬다.
없으면 `MapAuthException(401): Unauthorized` 가 난다.

**키 해시는 APK 에서 직접 뽑는다.** `~/.android/debug.keystore` 가 아니다 — `expo prebuild` 가
`mobile/android/app/debug.keystore` 를 따로 만들기 때문에 둘의 해시가 다르다.

```bash
apksigner verify --print-certs <apk> | grep SHA-1
# 나온 hex 를 base64 로: python -c "import base64,binascii;print(base64.b64encode(binascii.unhexlify('<hex>')).decode())"
```

값은 `.env` 에 따옴표 없이 넣는다. `KEY='abc'` 로 적으면 따옴표까지 값으로 읽혀 401 이 난다.

## 개인정보

- 위치 경로(`activities.route`)와 실시간 위치(`live_locations`)는 위치 정보다. 실시간 위치는 활동 종료 때 즉시 지운다
- 회원 탈퇴 때 개인 활동 상세(경로·사진 포함)를 지운다. 크루 합산은 `crew_daily_stats` 에 남는다(`ERD.md`)
- 사진은 서명 URL 로만 노출한다. 공개 버킷을 만들지 않는다
- 로그에 토큰·이메일·좌표를 남기지 않는다

## 스토어

- Android: `release.jks` 와 비밀번호는 저장소 밖(`local.properties`). 잃으면 덮어설치가 불가능하다
- iOS: 1차 범위 밖. 넣을 때 Apple 개발자 계정·서명·TestFlight 절차를 여기에 적는다
