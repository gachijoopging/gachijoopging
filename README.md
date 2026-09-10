# 가치줍깅

크루 단위로 플로깅하는 사람들이 활동을 기록하고 크루원끼리 나누는 앱. 왜 만드는지는 [`intent.md`](intent.md).

## 폴더

```
app/             React Native 앱 — 1차는 Android
backend/         Spring Boot 3.5 · Java 21 · Flyway (global·auth·media 이관, 나머지는 새로 작성)
design-system/   토큰 · 컴포넌트 · 캐릭터 에셋. 앱이 의존한다
ai/              추론 서버(FastAPI)·모델 학습. 담당자 영역. 가중치·데이터셋은 git 밖
infra/           (미결) 서버 구성이 정해지면 여기에
docs/            아래 문서 지도
CONTEXT.md       용어집. 코드·문서·대화의 말은 여기 것을 쓴다
```

## 문서 지도

| 알고 싶은 것 | 문서 |
|---|---|
| 왜 만드나, 무엇을 안 하나 | [`intent.md`](intent.md) |
| 무엇을 만드나, 결정과 이유 | [`docs/feature-scope.md`](docs/feature-scope.md) |
| 되돌리기 어려운 결정 | [`docs/adr/`](docs/adr/) |
| 화면 목록·이동·상태 | [`docs/screens.md`](docs/screens.md) |
| 테이블 | [`docs/ERD.md`](docs/ERD.md) |
| HTTP 계약 | [`docs/openapi.yaml`](docs/openapi.yaml) |
| 실시간(채팅·위치) 계약 | [`docs/realtime.md`](docs/realtime.md) |
| 커밋·브랜치·PR·이슈 | [`docs/conventions.md`](docs/conventions.md) |
| 옛 백엔드 도메인별 유지·개명·끔 | [`docs/backend-migration.md`](docs/backend-migration.md) |
| 배포·환경 변수·장애 | [`docs/operations.md`](docs/operations.md) |
| 옛 앱 참고 자료 | docs/legacy/ |

## 진행 순서

1. 계약(`openapi.yaml` · `realtime.md`) — 화면 합의 반영, 동의 저장 계약은 준비 중
2. 앱 프론트를 계약의 `example` 로 완성
3. 백엔드 — 가져온 3영역 잇기 + 나머지 새로 쓰기
4. 연결 · 테스트 · 마무리

## 처음 세팅

각자 1회, 클론 전에:

```powershell
git config --global core.longpaths true
```

공통: Docker Desktop(WSL2). 기본 브랜치는 `dev`.

**백엔드** — JDK 21. 로컬 DB 는 Supabase 개발 프로젝트 또는 로컬 PostGIS — 방식 미결

**디자인 시스템** — `design-system/` 에서 `npm run web` 이 카탈로그를 브라우저에 띄운다.

## 막히면

- 로컬은 되는데 CI 만 깨진다 → 대소문자
- `.sh` 가 EC2 에서 안 돈다 → CRLF 또는 실행 권한
- 로그인은 되는데 목록이 비었다 → 앱이 보는 서버 주소(`www` 인지, localhost 인지)
- 배포 구성·장애 대응 → `docs/operations.md` (신규 서버 구성 방식은 미결)
