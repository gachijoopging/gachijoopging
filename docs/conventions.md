# 컨벤션

옛 모노레포의 `docs/컨벤션/00-공통.md` 를 GitHub 저장소에 맞춰 옮긴 것이다. 이 문서가 정본이고 다른 곳에 복사하지 않는다.
백엔드 코드 규약은 `backend/docs/02-conventions.md`(옛 `docs/백엔드/02-conventions.md` 를 그대로 가져온다)를 따른다.

## 문서 규약

- 수명이 정해진 임시 문서를 영속 문서에서 링크하지 않는다. 내용이 필요하면 요약을 옮기고, 경위는 커밋 해시로 인용한다
- 결정은 `feature-scope.md` 표에, 되돌리기 어려운 결정은 `adr/` 에, 말은 `../CONTEXT.md` 에. 셋째 장소를 만들지 않는다
- 코드 주석에 동작 설명(How)·변경 이력·이슈 번호를 쓰지 않는다. 정책의 이유(Why)와 외부 제약만 남긴다

## 패키지 루트

공통 루트는 `site.gachijoopging`. 백엔드는 `site.gachijoopging.server`. RN 앱의 Android `applicationId` 는 **`site.gachijoopging.app`** — Firebase·카카오가 이 값으로 앱을 대조하므로 바꾸지 않는다.

## 커밋 메시지

Conventional Commits.

```
<type>(<scope>): <description>
```

| type | 용도 |
|---|---|
| `feat` | 기능 추가·변경 |
| `fix` | 버그 수정 |
| `docs` | 문서 |
| `style` | 포맷팅 |
| `design` | UI 디자인 |
| `refactor` | 리팩터링 |
| `test` | 테스트 |
| `chore` | 빌드·패키지·인프라 잡무 |

**scope 는 최상위 폴더 이름**: `app` · `backend` · `infra` · `design-system` · `docs`. 백엔드는 도메인까지 내려 쓴다.

```
feat(backend/crew): 초대 코드 재발급
fix(app): 활동 중 일시정지 뒤 거리 누적 오류
chore(infra): 모니터링 컨테이너 제거
```

## 브랜치

```
feat/<이슈 ID>-<이슈 제목 슬러그>      예: feat/GAC-12-초대-코드-재발급
```

- 이슈 하나 = 브랜치 하나 = PR 하나
- **Linear 이슈가 주는 브랜치 이름을 그대로 복사해 쓴다.** 손으로 짓지 않는다 — 이 이름 안의 이슈 ID 가 PR 을 이슈에 잇고, PR 열림 → In Review, 머지 → Done 을 자동으로 건다
- 슬러그는 이슈 제목을 옮긴 것이다(공백·금지 문자 → 하이픈). 한글 그대로 둔다
- `git check-ref-format "refs/heads/<이름>"` 으로 만들기 전에 검증한다

## 브랜치 전략과 머지

```
feat/… ──PR──▶ dev ──PR──▶ main
        squash O       squash X
```

- **`main`** 은 배포본. 머지되는 순간이 운영 배포다
- **`dev`** 는 통합 브랜치이자 기본 브랜치. 작업은 `dev` 에서 잘라 `dev` 로 돌아간다
- `feat → dev` 는 **squash merge**(PR 하나 = 커밋 하나). `dev → main` 은 **merge commit**(이슈별 배포 이력 보존)
- 승인 1명. 예외 없다 — 셋뿐이라 부담이 아니고, GitHub 브랜치 보호는 타입별 예외를 표현하지 못한다
- 브랜치 보호: `main`·`dev` 모두 force push 금지·직접 push 금지. PR 만. CI 필수 체크는 CI 가 들어온 뒤에 건다

**동기화는 두 번.** 시작할 때 `origin/dev` 에서 잘라내고, PR 올리기 직전 `git merge origin/dev` 로 내 브랜치에서 충돌을 푼다. `rebase` 는 쓰지 않는다 — `--force push` 가 남의 커밋을 날린다. 머지 뒤 `git fetch --prune`.

## PR

- 제목은 커밋 메시지와 같은 형식: `feat(backend/crew): 초대 코드 재발급`
- 본문 템플릿은 `.github/PULL_REQUEST_TEMPLATE.md`. 이슈는 브랜치 이름의 ID 로 자동 연결된다
- 리뷰어는 `.github/CODEOWNERS` 가 폴더별로 자동 지정한다. 사람이 고르지 않는다
- 평일 24시간 내 응답. 넘기면 데일리에서 언급

## 이슈 (Linear)

이슈는 Linear 한 곳에만 있다. **GitHub Issues 는 레포 설정에서 꺼 둔다** — 안 끄면 반은 저기, 반은 Linear 에 쌓인다.

- 라벨을 폴더 이름과 맞춘다: `app` · `ai` · `backend` · `infra` · `design-system` · `docs`. 커밋 scope 와 한 단어로 꿰어진다
- 유형 라벨: `feat` · `fix` · `chore`
- 하위 이슈로 쪼개지 않는다. Project 는 진행 순서 4단계(계약 · 앱 · 백엔드 · 통합)로 둔다
- 추정: `1`=1시간 이내 · `2`=3~4시간 · `3`=하루 · `5`=이틀 · `8`=3일. 8 이 나오면 쪼개라는 신호다
- 등록 절차와 설명 템플릿은 `/create-issue` 스킬(`.claude/skills/create-issue/SKILL.md`)이 정본이다

## 알림 (Mattermost)

보내는 길이 둘이고 쓰는 값이 다르다.

| | 무엇이 보내나 | 웹훅 값 |
|---|---|---|
| 자동 | `.github/workflows/notify-mattermost.yml` — PR 열림·머지·닫힘·승인·변경요청 | 레포 Secret `MM_WEBHOOK_URL` |
| 손으로 | `node infra/notify.mjs "메시지"` | 각자 `infra/.env` 의 `MM_WEBHOOK_URL` |

- **PR 이벤트만** 자동으로 보낸다. CI 실패·이슈·푸시는 보내지 않는다 — 3명 규모에서 그 이상은 노이즈가 되어 아무도 안 본다
- 웹훅 URL 은 각자 발급받아 자기 `infra/.env` 에 넣는다. 발급 방법은 `infra/.env.example` 에 적혀 있다. **저장소에 넣지 않는다**
- 손으로 보낼 때 웹훅 URL 을 직접 `curl` 하지 않고 `notify.mjs` 를 쓴다. 그래야 URL 이 쉘 히스토리에 남지 않는다

## 테스트

- 백엔드: `backend/docs/02-conventions.md` §12. "통과했다" 는 실제 실행 출력을 붙여 말한다
- 앱: 화면 로직은 훅·유틸 단위 테스트(Jest). 화면 자체는 목 데이터로 스토리(카탈로그)에 올려 눈으로 본다. E2E 는 1차에 두지 않는다
- 계약: `openapi.yaml` 은 CI 에서 `redocly lint` 로 검증하고, 백엔드 컨트롤러 경로·메서드와 대조하는 계약 테스트를 유지한다(옛 `OpenApiContractTest` 이식)

### CI — 아직 없다

백엔드 빌드가 초록이 된 뒤에 넣는다. 그 전에 넣으면 첫날부터 빨간 체크를 보게 되고, 빨강을 무시하는
습관이 먼저 생긴다. 넣을 때 `.github/workflows/` 에 셋을 두고 바뀐 폴더의 것만 돌린다.

| 워크플로 | 언제 | 무엇 |
|---|---|---|
| `contract` | `docs/openapi.yaml` | `redocly lint`. 설정은 `redocly.yaml` — 경고 0 이라야 새 경고가 신호가 된다 |
| `backend` | `backend/**` | `./gradlew test` (Java 21) |
| `design-system` | `design-system/**` | `npm test`. `node:test` 와 타입 스트리핑만 써서 설치가 필요 없다 |

여기 없는 것: 커버리지 게이트 · 앱 빌드 · 타입체크. 1차에 회수가 안 된다.

그때까지는 손으로 돌린다 — `npx @redocly/cli@1 lint docs/openapi.yaml` · `cd design-system && npm test` ·
`cd backend && ./gradlew test`.

### 완료의 정의

이슈를 Done 으로 옮기기 전에 넷 다 참이어야 한다.

1. 이슈의 **완료 조건**에 적은 검증을 실제로 돌렸고 그 출력을 PR 본문에 붙였다
2. CI 가 들어온 뒤에는 필수 체크가 초록이다. 그 전에는 위 명령을 손으로 돌린 출력으로 대신한다
3. 승인 1명을 받고 `dev` 에 머지됐다
4. 계약·화면·ERD 를 바꿨으면 해당 정본 문서를 같은 PR 에서 고쳤다

## Windows

팀 전원이 Windows 다.

- `.sh` 는 LF. `.gitattributes` 의 `*.sh text eol=lf` 가 강제한다. 실행 권한은 `git update-index --chmod=+x`
- 대소문자 오류는 CI(Linux)에서만 드러난다. "로컬은 되는데 CI 만 깨진다" 는 먼저 이걸 의심한다
- 한글이 든 `.ps1` 은 UTF-8 BOM
- 각자 1회: `git config --global core.longpaths true`, Docker Desktop WSL2
