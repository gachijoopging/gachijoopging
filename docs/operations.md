# 운영

Lightsail VM 한 대 + Supabase Postgres + 담당자 노트북의 AI 서버.

## 구성

VM 한 대에 docker compose 로 컨테이너 셋을 띄운다 — 백엔드(Spring)·Redis·Nginx. 근거는 ADR-0005.
옛 EC2 구성(blue/green·Postgres 컨테이너·LiveKit·모니터링)은 가져오지 않았다.

| | |
|---|---|
| 호스트 | AWS Lightsail 서울 · 2GB 번들(2 vCPU · 60GB SSD · 전송량 3TB) · Ubuntu 24.04 LTS |
| 대수 | **운영 한 대뿐이다. 스테이징을 두지 않는다**(ADR-0005). 첫 사용자를 받기 전에 `infra/` 스크립트로 한 번 새로 만들어 교체한다 |
| 고정 IP | 번들에 포함. 붙여 두지 않으면 재시작마다 주소가 바뀐다 |
| 스왑 | 2GB(`/swapfile`). 없으면 램이 찰 때 OOM Killer 가 가장 큰 프로세스 — 즉 백엔드 — 를 죽인다 |
| 공개 주소 | `www.gachijoopging.site`(apex 는 301 이라 쓰지 않는다) |
| 입구 | Nginx 가 443 을 잡고 `/api/v1/...` 를 백엔드로, 사진을 디스크에서 직접 보낸다. 채팅·위치가 STOMP 소켓(`realtime.md`)이라 WebSocket 업그레이드를 통과시킨다 |
| DB | Supabase Postgres(PostGIS) · 서울 (ADR-0001) |
| AI | 담당자 GPU 노트북 + 터널. 서버에 올리지 않는다 (`ai/README.md` §8) |

### 서버를 새로 만들 때

콘솔에서 하는 것과 스크립트가 하는 것이 나뉜다. 콘솔 작업은 자동화할 수 없어 여기 적는다.

**Lightsail 콘솔**

| | |
|---|---|
| 리전 | Seoul (ap-northeast-2). Supabase 와 같은 리전이라 DB 왕복이 짧다 |
| 블루프린트 | **OS Only → Ubuntu 24.04 LTS**. Apps+OS 를 고르면 Bitnami 가 80·443 을 미리 잡아 우리 Nginx 와 겹친다 |
| 번들 | $12 (2 vCPU · 2GB · 60GB SSD · 전송량 3TB). 1GB 짜리는 Spring Boot 하나로 찬다 |
| 고정 IP | `Networking` → `Attach static IP`. **안 붙이면 재시작마다 주소가 바뀌어 DNS 가 깨진다** |
| 방화벽 | `IPv4 Firewall` 에 **443 을 직접 추가**한다. 22·80 은 기본으로 열려 있다 |

**그다음 서버에서**

```sh
sh infra/provision.sh
```

스왑·도커·디렉터리를 만든다. 여러 번 돌려도 안전하다 — 이미 돼 있으면 건너뛴다.

## 로컬 기동

```powershell
powershell -ExecutionPolicy Bypass -File infra\dev-keys.ps1   # 최초 1회
docker compose -f infra/docker-compose.dev.yml up -d
curl http://localhost:8080/actuator/health                     # {"status":"UP"}
```

`dev-keys.ps1` 은 JWT 키 한 쌍을 만들어 루트 `.env` 에 넣는다. 백엔드는 그 키가 없으면 기동에서 죽는다 —
`application.yml` 이 기본값을 일부러 두지 않았다. 기본값이 있으면 운영에 키를 깜빡해도 서버가 떠 버리고,
그러면 누구나 공개된 그 키로 남의 토큰을 위조한다.

운영과 다른 점이 둘이다.

| | 로컬(`docker-compose.dev.yml`) | 운영(`docker-compose.yml`) |
|---|---|---|
| DB | **PostGIS 컨테이너** | Supabase (서버 밖) |
| 이미지 | 그 자리에서 빌드 | 레지스트리에서 태그로 가져옴 |

로컬에 DB 컨테이너를 두는 이유는 스테이징이 없기 때문이다(ADR-0005). 로컬이 Supabase 를 보면 각자 PC 가
운영 DB 를 만지게 되고, Flyway 마이그레이션을 깨뜨려 보며 고치는 일이 불가능해진다.
`postgis/postgis` 이미지라야 한다 — `V1__init.sql` 첫 줄이 `CREATE EXTENSION postgis` 다.

**호스트 포트가 표준이 아니다** — Postgres `15432`, Redis `16379`. 다른 프로젝트의 컨테이너가 5432·6379 를
쓰고 있으면 기동이 막혀서 비켜 놓았다. 컨테이너끼리는 내부 포트로 통신하므로 영향이 없다.
백엔드만 IDE 에서 띄울 때는 `SPRING_DATASOURCE_URL`·`SPRING_DATA_REDIS_PORT` 로 알려준다.

## 배포

스테이징이 없다(ADR-0005). 서버는 운영 한 대뿐이다.

| 언제 | 무엇이 일어나나 |
|---|---|
| `dev` 머지 | CI 가 돌고, 이미지를 만들어 레지스트리에 올린다. **배포하지 않는다** |
| `main` 머지 | 그 태그를 운영에 배포한다. **다시 빌드하지 않는다** |

다시 빌드하면 그 사이 바뀐 의존성이 섞여, CI 가 검증한 것과 다른 물건이 운영에 올라간다. 롤백은 직전
`IMAGE_TAG` 로 되돌리는 한 명령이다.

그래서 **환경에 따라 달라지는 값은 이미지에 굽지 않는다.** 주소·자격증명은 전부 `infra/.env` 로 주입한다.
`application.yml` 에서 `${PUBLIC_BASE_URL:...}` 처럼 쓰인 것이 그 모양이고, 콜론 뒤는 값이 없을 때의
기본값일 뿐이다. 키 1:1 대조는 GAC-99.

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

**이 표 · `infra/.env.example` · 백엔드가 `${...}` 로 읽는 이름 셋이 1:1 이어야 한다.** 어긋나면 기동에서
죽는다. 읽는 쪽(백엔드)에 없는 키를 표에 두지 않고, 표에 없는 키를 백엔드가 읽지 않게 한다.

| 키 | 읽는 쪽 | 용도 |
|---|---|---|
| `DOCKERHUB_USER` · `IMAGE_TAG` | 배포 스크립트 | 이미지 좌표. `IMAGE_TAG` 는 deploy.sh 가 갱신 |
| `PUBLIC_BASE_URL` | 백엔드 | 서명 URL·메일 링크의 기준 |
| `INVITE_BASE_URL` | 백엔드 | 초대 링크 앞부분. 카카오톡으로 공유되는 주소다 |
| `DATABASE_URL` · `DATABASE_USER` · `DATABASE_PASSWORD` | 백엔드 | Supabase 접속. 옛 `POSTGRES_*` 는 컨테이너용이라 없어진다 |
| `REDIS_HOST` · `REDIS_PORT` | 백엔드 | STOMP 브로커 릴레이·채팅 pub/sub |
| `JWT_ACTIVE_KID` · `JWT_PRIVATE_KEY_PEM` · `JWT_PUBLIC_KEY_PEM` · `JWT_PREVIOUS_*` | 백엔드 | 토큰 서명. kid 회전용 이전 키 |
| `KAKAO_APP_ID` · `GOOGLE_CLIENT_ID` | 백엔드 | 소셜 토큰 검증 |
| `MEDIA_ROOT` · `MEDIA_SECURE_LINK_SECRET` | 백엔드 · Nginx | 사진 보관 경로와 서명 URL. `MEDIA_ROOT` 는 컨테이너 안 경로이고 compose 가 볼륨으로 디스크에 잇는다 |
| `MAIL_USERNAME` · `MAIL_PASSWORD` | 백엔드 | 비밀번호 재설정 메일 |
| `FCM_CREDENTIALS` | 백엔드 | 푸시 |
| `AI_BASE_URL` · `AI_SECRET` | 백엔드 | AI 서버. `ai/.env` 의 `NGROK_DOMAIN`·`AI_SECRET` 과 짝이다 — `AI_SECRET` 이 다르면 호출이 전부 401 인데 백엔드가 401 을 `UNAVAILABLE` 로 내려 "AI 서버 다운" 과 구별되지 않는다 |
| `CERT_DOMAIN` · `CERT_EMAIL` | acme | 인증서 발급·갱신 |
| `AGREEMENTS_VERSION` · `TERMS_URL` · `PRIVACY_URL` · `MARKETING_URL` | **아직 없음** | 현재 동의 버전과 공개 전문 URL. 계약(`openapi.yaml` `/agreements`)과 테이블(`user_agreements`)은 있지만 **백엔드가 아직 읽지 않는다** — 동의 API 를 구현할 때 들어온다. 전문 정본은 `docs/legal/`, 버전은 각 문서 머리의 값(지금 `2026-10`). 정식 주소가 서빙되기 전까지는 `https://djm030.github.io/gachijoopging-legal/{terms,privacy,marketing}` 를 넣는다. 정식 주소 전환과 전문의 빈칸(문의 이메일·리전)은 GAC-80 |

없어지는 키: `LIVEKIT_*` · `GRAFANA_ADMIN_PASSWORD` · `ADMIN_WEB_TAG` · `POSTGRES_*` ·
`KAKAO_REST_API_KEY`(auth 를 계약 기준으로 다시 쓰면서 카카오 좌표 조회가 빠졌다).

푸시(FCM)는 Firebase 프로젝트 `gachi-joopging`, Android 패키지 `site.gachijoopging.app` 으로 등록돼 있다. `google-services.json` 은 Firebase 콘솔에서 내려받는다.

`.env` 를 고칠 때는 **바이너리로 다룬다.** PEM 값에 CR 이 섞이면 docker compose 는 통과시키고 Spring 만 `Missing key encoding` 으로 죽는다. Windows 편집기로 열지 않고 `dev-env.ps1` 같은 스크립트로 올린다.

## `mobile/.env` 키 (앱)

위 표는 서버(`infra/.env`)다. 앱은 별도이며 각자 로컬에만 둔다 — `.gitignore` 가 막는다.

| 키 | 용도 |
|---|---|
| `KAKAO_NATIVE_APP_KEY` | 카카오맵 SDK 초기화. 없으면 지도 화면이 안내 배너만 띄운다 |
| `API_BASE_URL` | 실서버 HTTP 기준 주소. 예 `https://www.gachijoopging.site/api/v1` |
| `WS_URL` | 실서버 소켓 주소. 예 `wss://www.gachijoopging.site/api/v1/ws` |
| `EXPO_PUBLIC_API_MODE` | `real` 이고 `API_BASE_URL` 이 있을 때만 실서버로 붙는다. 그 밖에는 목(openapi example) |

카카오 개발자 콘솔 → 앱 설정 → 플랫폼 → Android 에 **패키지명과 키 해시**가 등록돼 있어야 지도가 뜬다.
없으면 `MapAuthException(401): Unauthorized` 가 난다.

**키 해시는 APK 에서 직접 뽑는다.** `~/.android/debug.keystore` 가 아니다 — `expo prebuild` 가
`mobile/android/app/debug.keystore` 를 따로 만들기 때문에 둘의 해시가 다르다.

```bash
apksigner verify --print-certs <apk> | grep SHA-1
# 나온 hex 를 base64 로: python -c "import base64,binascii;print(base64.b64encode(binascii.unhexlify('<hex>')).decode())"
```

값은 `.env` 에 따옴표 없이 넣는다. `KEY='abc'` 로 적으면 따옴표까지 값으로 읽혀 401 이 난다.

## 데모 계정

데모 크루·계정은 `DemoSeedRunner`(`backend/.../seed/`)가 넣는다. 스테이징을 두지 않아(ADR-0005) 서버에서 플래그로만 켠다. **기본은 꺼짐**이고, 다시 돌려도 중복을 만들지 않는다(고정 id, 있으면 건너뜀). 자격 값은 팀 채널로만 주고받는다.

| 키 | 읽는 쪽 | 용도 |
|---|---|---|
| `DEMO_SEED_ENABLED` | 백엔드 | `true` 일 때만 러너가 뜬다. 켜면 아래 넷이 모두 있어야 기동한다 |
| `DEMO_MEMBER_EMAIL` · `DEMO_MEMBER_PASSWORD` | 백엔드 | 계정 ① — 데모 크루(공개·서울) 크루원. 데모 E2E 1단계(3-1 부터) |
| `DEMO_GUEST_EMAIL` · `DEMO_GUEST_PASSWORD` | 백엔드 | 계정 ② — 소속·추방 이력 없음, 과거 활동 2건. 2단계(1-8 공개 크루 가입부터). 순회마다 **크루 나가기**로 되돌린다 — 추방하면 같은 크루에 다시 가입할 수 없다 |

넣는 것: 데모 크루(크루장 + 크루원 3, 지난 7일 활동 6건·`crew_daily_stats`·게시물 2·공지 1·채팅 3), 비공개 크루(크루장 1). 크루장·크루원 계정은 로그인 수단이 없다.

- 시드의 이메일·닉네임·크루 이름을 이미 다른 행이 쓰고 있으면 시드 전체를 건너뛰고 경고만 남긴다. 기동은 막지 않는다
- 처음 실행한 시각과 자격 값이 고정된다. 이후 `DEMO_*` 를 바꿔도 반영되지 않는다 — 비밀번호는 앱의 비밀번호 재설정으로 바꾼다
- "지난 7일" 활동은 첫 실행 시각 기준이라 일주일 뒤에는 홈 카드가 빈다. 데모 직전에 다시 시드한다:
  1. `backend/src/main/resources/seed/demo-reset.sql` 을 DB 에 실행한다. 데모 크루 두 개와 거기 딸린 활동·통계·피드·공지·채팅·신청·크루원을 지운다. 계정은 남긴다 — 동의·비밀번호가 유지된다
  2. `DEMO_SEED_ENABLED=true` 로 서버를 재기동한다
- 활동만 골라 지우지 않는다. `crew_daily_stats` 가 남아 재시드 때 통계가 두 배가 된다

## 개인정보

- 위치 경로(`activities.route`)와 실시간 위치(`live_locations`)는 위치 정보다. 실시간 위치는 활동 종료 때 즉시 지운다
- 회원 탈퇴 때 개인 활동 상세(경로·사진 포함)를 지운다. 크루 합산은 `crew_daily_stats` 에 남는다(`ERD.md`)
- 사진은 서명 URL 로만 노출한다. 공개 버킷을 만들지 않는다
- 로그에 토큰·이메일·좌표를 남기지 않는다

## 스토어

- Android: `release.jks` 와 비밀번호는 저장소 밖(`local.properties`). 잃으면 덮어설치가 불가능하다. 자세한 것은 아래 §앱 서명
- iOS: 1차 범위 밖. 넣을 때 Apple 개발자 계정·서명·TestFlight 절차를 여기에 적는다

## 앱 서명

릴리스 APK 는 모두 같은 키(`release.jks`)로 서명한다. 카카오맵·Firebase 가 `site.gachijoopging.app` 과 이 키의 해시로
앱을 대조하므로, 키가 다르면 지도가 `MapAuthException(401)` 로 안 뜨고 옛 APK 위에 덮어설치도 안 된다.

- 키 파일과 비밀번호는 **팀 비밀 보관소**에서 받는다. 저장소에 넣지 않는다(`.gitignore` 의 `*.jks`·`*.keystore`)
- `mobile/plugins/with-release-signing.js` 가 아래 순서로 읽는다. 둘 다 없으면 debug 키로 서명된다 — 빌드는 되지만 카카오맵이 안 뜬다

| 환경 변수 (배포 채널·CI) | `mobile/local.properties` (로컬) | 값 |
|---|---|---|
| `ANDROID_KEYSTORE_PATH` | `RELEASE_STORE_FILE` | 키 파일 경로. 상대 경로는 `mobile/` 기준 (예 `release.jks`). 절대 경로는 `C:/keys/release.jks` 처럼 `/` 로 쓴다. `local.properties` 에서 `\` 는 이스케이프 문자다 |
| `ANDROID_KEYSTORE_PASSWORD` | `RELEASE_STORE_PASSWORD` | 저장소 비밀번호 |
| `ANDROID_KEY_ALIAS` | `RELEASE_KEY_ALIAS` | 키 별칭 |
| `ANDROID_KEY_PASSWORD` | `RELEASE_KEY_PASSWORD` | 키 비밀번호. 없으면 저장소 비밀번호 |

키 지문(공개값, 콘솔 등록용):

```
SHA-1   A3:57:14:98:05:50:8B:BF:62:87:67:52:C9:15:2A:C2:01:CD:4F:1E
SHA-256 73:E7:E6:0D:7E:7B:AE:18:55:88:D1:E4:5A:25:F8:85:84:1A:01:58:66:37:25:B6:04:CB:9D:BF:FE:6C:0C:EA
카카오 키 해시 o1cUmAVQi79ih2dSyRUqwgHNTx4=
```

새로 받은 APK 가 이 키로 서명됐는지는 `apksigner verify --print-certs <apk>` 의 SHA-1 로 확인한다.
