# 가치줍깅 (크루판)

크루 단위로 플로깅하는 사람들이 활동을 기록하고 크루원끼리 나누는 앱. 왜 만드는지는 [`intent.md`](intent.md).

## 폴더

```
app/             React Native 앱 — 1차는 Android
backend/         Spring Boot 3.5 · Java 21 · Flyway (옛 모노레포에서 복사, 끌 것을 끈 상태)
design-system/   토큰 · 컴포넌트 · 캐릭터 에셋. 앱이 의존한다
infra/           EC2 compose(nginx · backend · acme · redis) · 배포 스크립트
docs/            아래 문서 지도
CONTEXT.md       용어집. 코드·문서·대화의 말은 여기 것을 쓴다
```

## 문서 지도

| 알고 싶은 것 | 문서 |
|---|---|
| 왜 만드나, 무엇을 안 하나 | [`intent.md`](intent.md) |
| 무엇을 만드나, 결정과 이유 | [`docs/기능범위.md`](docs/기능범위.md) |
| 되돌리기 어려운 결정 | [`docs/adr/`](docs/adr/) |
| 화면 목록·이동·상태 | [`docs/화면.md`](docs/화면.md) |
| 테이블 | [`docs/ERD.md`](docs/ERD.md) |
| HTTP 계약 | [`docs/openapi.yaml`](docs/openapi.yaml) |
| 실시간(채팅·위치) 계약 | [`docs/소켓.md`](docs/소켓.md) |
| 커밋·브랜치·PR·이슈 | [`docs/컨벤션.md`](docs/컨벤션.md) |
| 옛 백엔드 도메인별 유지·개명·끔 | [`docs/백엔드정리.md`](docs/백엔드정리.md) |
| 배포·환경 변수·장애 | [`docs/운영.md`](docs/운영.md) |

## 진행 순서

1. 계약(`openapi.yaml` · `소켓.md`) — 완료
2. 앱 프론트를 계약의 `example` 로 완성
3. 백엔드 정리·구현
4. 연결 · 테스트 · 마무리

## 처음 세팅

각자 1회, 클론 전에:

```powershell
git config --global core.longpaths true
```

공통: Docker Desktop(WSL2). 기본 브랜치는 `dev`.

**앱** — Node 22 LTS + Android Studio(SDK 36). `app/` 에서 `npm install`, `npm run android`. 카카오맵 네이티브 모듈이 있어 Expo Go 는 못 쓰고 개발 빌드로 돈다.

**백엔드** — JDK 21. 로컬 DB·Redis 는 `infra/docker-compose.dev.yml`:

```bash
docker compose -f infra/docker-compose.dev.yml up -d
cd backend && ./gradlew bootRun
```

JWT 키는 `infra/scripts/gen-jwt-key.ps1` 로 만들어 `.env` 에 넣는다.

**디자인 시스템** — `design-system/` 에서 `npm run web` 이 카탈로그를 브라우저에 띄운다.

## 막히면

- 로컬은 되는데 CI 만 깨진다 → 대소문자
- `.sh` 가 EC2 에서 안 돈다 → CRLF 또는 실행 권한
- 로그인은 되는데 목록이 비었다 → 앱이 보는 서버 주소(`www` 인지, localhost 인지)
- 배포 뒤 502 → `deploy.sh` 를 안 썼다. `docs/운영.md`
