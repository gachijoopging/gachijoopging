# 컨벤션

옛 모노레포의 `docs/컨벤션/00-공통.md` 를 GitHub 저장소에 맞춰 옮긴 것이다. 이 문서가 정본이고 다른 곳에 복사하지 않는다.
백엔드 코드 규약은 `backend/docs/02-conventions.md`(옛 `docs/백엔드/02-conventions.md` 를 그대로 가져온다)를 따른다.

## 문서 규약

- 수명이 정해진 임시 문서를 영속 문서에서 링크하지 않는다. 내용이 필요하면 요약을 옮기고, 경위는 커밋 해시로 인용한다
- `docs/superpowers/` 는 그 임시 문서다(gitignore 됨, 개인 작업 초안). 팀이 알아야 하는 결정은 반드시 아래 정본으로 옮긴다 — 옮기기 전에는 없는 결정으로 친다
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
<계정명>/gac-<번호>      예: djm062954/gac-5
```

- 이슈 하나 = 브랜치 하나 = PR 하나
- **슬러그를 붙이지 않는다.** Linear 의 "Copy git branch name" 은 이슈 제목을 그대로 슬러그로 붙이는데, 제목이 한글이면 브랜치 이름도 한글이 된다 — 팀 전원 Windows 라 PowerShell·일부 터미널에서 한글 브랜치명이 깨지거나 탭 완성이 꼬이는 문제가 있어 통째로 뺀다. Linear 가 준 이름에서 `-<슬러그>` 부분만 잘라내고 쓴다
- 브랜치 이름 안의 이슈 ID(`gac-N`)가 PR 을 이슈에 잇고, PR 열림 → In Review, 머지 → Done 을 자동으로 건다 — 슬러그를 잘라도 이 연결에는 영향 없다
- 커밋 type(`feat`/`fix`/`chore`)은 브랜치 이름이 아니라 **커밋 메시지**에 남는다
- `git check-ref-format "refs/heads/<이름>"` 으로 만들기 전에 검증한다

## 브랜치 전략과 머지

```
<계정명>/gac-N-… ──PR──▶ dev ──PR──▶ main
                  squash O       squash X
```

- **`main`** 은 배포본. 머지되는 순간이 운영 배포다
- **`dev`** 는 통합 브랜치이자 기본 브랜치. 작업은 `dev` 에서 잘라 `dev` 로 돌아간다
- 이슈 브랜치 → `dev` 는 **squash merge**(PR 하나 = 커밋 하나). `dev → main` 은 **merge commit**(이슈별 배포 이력 보존)
- `dev` 는 승인 없이 셀프 머지 가능. `main` 은 승인 1명 필수 — 배포 직전 관문은 셋뿐이라도 예외 없이 지킨다
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
- 하위 이슈로 쪼개지 않는다. Project 는 **주 단위** 5개다

| Project | 기간 | 무엇 |
|---|---|---|
| `W0 레포 정비` | 9/10 ~ 9/11 | 협업 체계. 다른 모든 것보다 먼저 |
| `W1 골격` | 9/27 ~ 10/4 | 백엔드 빌드 복구 · 카카오맵 스파이크 · RN 골격 · 서버 구성 결정 |
| `W2 도메인` | 10/5 ~ 10/11 | 전 도메인 · 인프라 · 앱 실 API 전환. 10/11 에 스테이징에서 데모 경로가 끝까지 돈다 |
| `W3 통합·마무리` | 10/12 ~ 10/18 | 통합 QA · W2 에서 밀린 것 · **10/18 코드 프리즈** |
| `W4 마무리` | 10/19 ~ 10/25 | 버퍼. 크래시·데이터 유실급 버그만 · 릴리스 APK · 발표 |

- 추정: `1`=1시간 이내 · `2`=3~4시간 · `3`=하루 · `5`=이틀 · `8`=3일. 8 이 나오면 쪼개라는 신호다
- 등록 절차와 설명 템플릿은 `/create-issue` 스킬(`.claude/skills/create-issue/SKILL.md`)이 정본이다

### 상태 전환은 연동이 한다

Linear↔GitHub 연동이 브랜치 이름의 이슈 ID 로 PR 을 이슈에 붙이고, PR 열림 → **In Review**,
머지 → **Done** 으로 옮긴다. 손으로 옮기지 않는다.

- 브랜치 이름에 `gac-N` 이 없으면 연결되지 않는다. 그때만 손으로 옮기고 PR 링크를 붙인다

### Linear 연결 (각자 1회)

`.mcp.json` 이 Linear MCP 서버를 팀 공통으로 정의하고, **인증은 각자 OAuth 로** 한다.

1. Claude Code 에서 `/mcp` → `linear` → Authenticate
2. 열린 브라우저에서 가치줍깅 워크스페이스 계정으로 승인한다

발급받아 보관할 키가 없다. `.mcp.json` 에 `headers.Authorization` 을 넣지 않는다 —
넣는 순간 OAuth 폴백이 꺼져서 토큰이 없으면 401 로 죽는다.

## 알림 (Mattermost)

보내는 것은 **셋뿐**이다. `.claude/hooks/notify-push.mjs` 가 보낸다 — Claude Code 의 PostToolUse
훅으로, `git push`·`gh pr create`·`gh pr merge` 를 로컬에서 잡아 각자의 웹훅으로 직접 쏜다.
GitHub Actions 는 안 쓴다.

| 언제 | 무엇 |
|---|---|
| `dev` 에 반영 | 머지된 커밋(또는 PR) 제목 + 링크 |
| `main` 에 반영 | 배포다. 같은 형식 |
| 리뷰어 지정 | `gh pr create` 로 PR 을 열 때 CODEOWNERS 가 자동 지정한 리뷰어를 멘션하고 PR 링크 |

작업 브랜치 푸시·PR 열림 자체·승인·댓글은 **보내지 않는다.** 3명 채널에서 노이즈가 되어 아무도 안 보게 된다.
CI 실패도 안 보낸다 — PR 에 이미 보인다.

**한계**: 로컬 훅이라 Claude Code 를 거치지 않은 작업은 못 잡는다 — GitHub 웹에서 직접 머지하거나
터미널에서 맨 `git`/`gh` 를 쓰면 알림이 안 나간다. 그 경우 아래처럼 손으로 보낸다.

웹훅 값은 각자 저장소 루트 `.env` 의 `MM_WEBHOOK_URL` 이다. 팀 공용 Secret 은 안 쓴다.

손으로 뭔가 알리고 싶으면 `node infra/notify.mjs "메시지"` 를 쓴다. 이건 각자 저장소 루트 `.env` 의
`MM_WEBHOOK_URL` 을 읽으므로 자기 이름으로 나간다. 발급 방법은 루트 `.env.example` 에 있다.
웹훅 URL 을 직접 `curl` 하지 않는다 — 쉘 히스토리에 남는다.
루트 `.env` 는 로컬 설정, `infra/.env` 는 EC2 에 올라가는 운영 값이다. 섞지 않는다.

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
3. `dev` 에 머지됐다 (승인 불요, 셀프 머지)
4. 계약·화면·ERD 를 바꿨으면 해당 정본 문서를 같은 PR 에서 고쳤다

## Windows

팀 전원이 Windows 다.

- `.sh` 는 LF. `.gitattributes` 의 `*.sh text eol=lf` 가 강제한다. 실행 권한은 `git update-index --chmod=+x`
- 대소문자 오류는 CI(Linux)에서만 드러난다. "로컬은 되는데 CI 만 깨진다" 는 먼저 이걸 의심한다
- 한글이 든 `.ps1` 은 UTF-8 BOM
- 각자 1회: `git config --global core.longpaths true`, Docker Desktop WSL2
- **앱을 빌드하려면 각자 1회 둘 다** 해야 한다. RN 의 C++ 코드젠이 객체 파일 경로에 소스 절대경로를 그대로 복제해 369자가 되는데 Windows 기본 한계는 260자다. 저장소를 짧은 경로로 옮겨도 305자라 넘는다

  1. 관리자 PowerShell 에서 장경로를 켠다. 위 `core.longpaths` 는 git 전용이라 빌드에는 듣지 않는다

     ```powershell
     Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1
     ```

  2. **ninja 를 1.12 이상으로 바꾼다.** 1번만으로는 안 된다 — 장경로는 실행 파일이 매니페스트로 opt-in 해야 효력이 있는데, Android SDK 가 들고 오는 ninja 1.10.2 는 그걸 안 한다. `cmake;3.31.4` 를 받아도 ninja 는 그대로다

     [ninja 릴리스](https://github.com/ninja-build/ninja/releases) 에서 `ninja-win.zip`(v1.12.1)을 받아
     `%LOCALAPPDATA%\Android\Sdk\cmake\3.22.1\bin\ninja.exe` 를 교체한다. 원본은 백업해 둔다

  둘 다 끝나면 터미널을 새로 열고 `ninja --version` 이 1.12.1 인지 확인한다
