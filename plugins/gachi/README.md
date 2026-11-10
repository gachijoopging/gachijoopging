# gachi — 가치줍깅 팀 Claude Code 플러그인 사용법

Linear 이슈 하나를 고르는 것부터 dev PR · 남의 PR 리뷰 · 내 리뷰 직접 반영 · 머지까지, [AGENTS.md](../../AGENTS.md) 와 [docs/conventions.md](../../docs/conventions.md) 의 규칙대로 대신 해 주는 스킬 4개다. 규칙은 그쪽이 기준이고, 이 문서는 "어떻게 쓰나" 만 적는다.

| 명령 | 언제 | 하는 일 | 하지 않는 것 |
| --- | --- | --- | --- |
| `/gachi:ship-issue [GAC-N]` | 내 이슈를 시작할 때 | 이슈 고르기 → `.claude/worktrees/gac-N` 으로 세션 이동 → 플랜 모드 계획 → 승인 → 완료 조건마다 빨강 테스트(세션) · 초록 구현(서브에이전트) · 테스트 재확인(세션) → 검증(최대 3번) → `pr-creator` 로 PR | 머지 · Linear 상태 변경 |
| `/gachi:review-pr [N …]` | 리뷰를 부탁받았을 때 | 내가 리뷰 요청된 PR 을 찾아 **새 에이전트**가 임시 worktree 에서 비판적 리뷰 → 지적을 파일:줄로 다시 확인 → `gh pr review` (필수 수정 없고 내 PR 아니면 Approve) | 머지 · 코드 수정 · push · 변경 요청 |
| `/gachi:apply-pr [N]` | 내가 단 리뷰를 내가 직접 반영할 때 | 내 지적을 `1-1 · 1-2` 표로 → 승인 → 작성자 브랜치 worktree 에서 테스트 먼저 고쳐 항목마다 커밋 → fast-forward push → 반영 댓글 → `review-pr` 한 번 더 | 내 PR · `main` 대상 PR · 머지. **AGENTS.md "담당 폴더 밖을 고치지 않는다" 의 유일한 예외**(승인 뒤) |
| `/gachi:merge-pr [N]` | 승인 · 체크가 끝난 PR 을 넣을 때 | 머지 가능한 PR 을 골라 한 번 확인 → `dev` 는 squash, `main` 은 merge commit → 원격 브랜치 · worktree 정리 | 알림 직접 발송(훅이 한다) · Linear 상태 변경 |

## 준비물

- Claude Code 를 **가치줍깅 저장소 폴더에서** 연다. 폴더 신뢰(trust) 창에서 수락해야 저장소의 `.claude/settings.json`(마켓플레이스 · 플러그인 켜기 · 알림 훅)이 적용된다
- `gh auth login`. 스킬이 `gh` 로 PR · 리뷰 · 머지를 다룬다
- Claude Code 안에서 `/mcp` → `linear` 인증 (`docs/conventions.md` §Linear 연결). `ship-issue` 는 필수, `review-pr` · `apply-pr` 는 없어도 돈다
- 루트 `.env` 에 `MM_WEBHOOK_URL`. 없으면 PR 열림 · 머지 알림이 안 나간다 (발급은 `.env.example`)
- `git config --global core.longpaths true`. worktree 안의 backend 테스트 픽스처가 Windows 경로 길이에 걸린다
- `ship-issue` 는 작업 트리가 더러워도 된다 (이슈 worktree 로 들어간다). `apply-pr` · `review-pr` 도 임시 worktree 를 쓴다

## 설치 (처음 한 번)

저장소 폴더에서:

```bash
claude plugin install gachi@gachi --scope project
claude plugin list        # gachi@gachi · Scope: project · enabled 가 보여야 한다
```

설정 파일만으로도 마켓플레이스는 등록되지만, **설치 기록이 없으면** 스킬이 로드되지 않고 `claude plugin update` 가 `not installed` 로 실패한다. 이 명령은 `.claude/settings.json` 을 같은 내용으로 다시 쓰는데, 저장소 파일이 이미 그 순서라 `git status` 는 그대로 비어 있다. 그 뒤 Claude Code 를 다시 열면 `/gachi:` 까지 치면 스킬 4개가 자동 완성된다.

## 업데이트

플러그인은 저장소 `plugins/gachi` 에 있고 마켓플레이스가 `dev` 브랜치를 가리킨다. 그래서 **dev 에 머지되면 그게 배포**다.

- **자동**: 저장소 폴더에서 연 세션의 첫 메시지 뒤 10분 안에 한 번 받아 두고, **다음 세션**부터 새 버전이다 (`.claude/settings.json` 의 `autoUpdate: true`). 백그라운드라 git 자격 증명 창이 뜨는 환경이면 조용히 실패한다
- **지금 바로**:

  ```bash
  claude plugin marketplace update gachi && claude plugin update gachi@gachi
  ```

  세션 안에서는 `/plugin marketplace update gachi` 뒤 `/reload-plugins`
- **지금 버전 확인**: `claude plugin list` 의 `Version` 이 dev 머리 커밋 앞 12자다 (`plugin.json` 에 version 이 없어 커밋으로 센다). dev 커밋은 `git log -1 --format=%h origin/dev`
- `/plugin` 화면의 자동 업데이트 토글은 저장소 `.claude/settings.json` 을 고친다. 그 변경은 커밋에 섞지 않는다

## 흐름

```
내 이슈 ─ship-issue→ PR (In Review) ─리뷰어: review-pr─┬─ 필수 수정 없음 → Approve ─→ merge-pr → dev (훅 알림 · Linear Done)
                                                       └─ 수정 필요 → 리뷰어: apply-pr → push → review-pr(재) → Approve ┘
```

## 스킬별

### ship-issue

- 인자 없이 부르면 내 이슈(Backlog · Todo · In Progress)를 기한순으로 보여 준다. 첫 선택지 `(추천) 자동 선택` 이 기한 가장 빠른 것이고, 후보가 1개면 묻지 않는다. 막힌 것(blocked by 미완료)은 뺀다
- 이슈 설명에 **`## 완료 조건` 이 없으면 멈춘다.** `/create-issue` 템플릿대로 채우고 다시 부른다
- `.claude/worktrees/gac-N` 을 `<계정명>/gac-N` 브랜치로 만들어 세션이 그 안으로 들어간다. 주 checkout 은 건드리지 않는다. `app` · `design-system` 이슈면 그 폴더에서 `npm ci` 를 한 번 돌린다
- 플랜 모드에서 계획을 세우고, 이슈 · docs 가 정하지 않은 것(값 형식 · 새 의존성 · 범위 축소 · 선행 이슈 미머지 등)은 선택지로 묻는다
- 완료 조건마다 빨강 테스트는 세션이 쓰고, 초록 구현은 서브에이전트가 허용 파일 목록 안에서 한다. 서브에이전트는 묻지 못하므로 판단거리가 생기면 `QUESTION:` 만 돌려주고, 세션이 사용자에게 물은 뒤 다시 보낸다. 테스트는 세션이 직접 다시 돌린다
- 검증은 폴더별 명령만, 최대 3번. 3번째도 실패하면 push 하지 않고 Linear 코멘트 + 보고로 멈춘다
- 끝나면 `pr-creator` 가 PR 을 열고 훅이 리뷰어에게 알린다. 세션은 `ExitWorktree(keep)` 로 나온다. 리뷰 반영 때 `EnterWorktree(path)` 로 되들어간다

### review-pr

- 인자 없이 부르면 "작성자가 내가 아니고 · 리뷰 요청됐거나 이미 리뷰를 냈고 · 지금 머리 커밋을 아직 리뷰하지 않은" PR 을 고르게 한다. 번호를 주면 조건 없이 그 PR 만 (셀프 리뷰도 됨, Approve 는 안 함)
- 머리 커밋을 `$TEMP/rv-N` 임시 worktree 에 꺼내 **새 에이전트**가 리뷰한다. `backend/` 가 바뀌었으면 `backend-guard` 도 같이. 내 작업 트리 · 브랜치는 건드리지 않는다
- 에이전트 지적을 그대로 올리지 않는다. 파일:줄을 다시 열어 틀린 것 · 이미 달린 리뷰와 같은 것은 뺀 뒤 묻지 않고 올린다. 내 역할이 정할 것만 묻는다
- 리뷰는 `<!-- review-pr run= sha= -->` 마커 + `## 코드 리뷰` 양식이라 프로젝트 스킬 `/review-pr` 와 같은 모양이고, `apply-pr` 이 항목별로 읽는다

### apply-pr

- 리뷰어가 쓴다. 후보 = 내 마지막 마커 리뷰에 `[필수 수정]` · `[개선 제안]` 이 있고, 그 리뷰의 sha 가 아직 머리 커밋인 남의 dev PR. 머리가 움직였으면 `review-pr` 먼저
- 한 지적에 요청이 여러 개면 `1-1 · 1-2` 로 쪼갠다. 반영 전에 `표대로 전부 / 일부만 / 멈춤` 을 묻는다 — 남의 브랜치에 push 하는 일이라서다
- 항목마다 커밋 하나 → `git -C … push`(fast-forward 만) → PR 댓글 하나(`1-1 고쳤어요 — <sha>`) → `review-pr` 한 번 더. 깨끗하면 거기서 Approve 된다
- 리뷰어가 자기 수정을 승인하는 셈이므로 **작성자도 diff 를 한 번 본다**

### merge-pr

- 인자 없이 부르면 `mergeStateStatus` 가 `CLEAN` · `UNSTABLE` 이고 APPROVED 가 있는 PR 을 고르게 한다. 번호를 주면 그 PR 만. dev 대상인데 승인이 없으면 한 번 묻고 머지한다 (규약상 dev 는 셀프 머지 허용)
- `dev` 는 squash + `--subject "<PR 제목> (#N)"`, `main` 은 merge commit. `gh pr merge <번호>` 형태를 지키므로 훅이 `dev 반영` / `main 배포` 를 보낸다
- 머지 뒤 원격 이슈 브랜치 · `.claude/worktrees/gac-N` · 로컬 브랜치를 치운다

## 자주 막히는 것

| 증상 | 이유 · 해결 |
| --- | --- |
| `gh` 401 · 404 | `gh auth status` 로 확인. 만료면 `gh auth login` |
| `reviewDecision` 이 빈 값 | dev 는 ruleset 이 승인 0명이라 정상. 스킬은 `latestReviews` 로 본다 |
| approve 가 422 | 내 PR 이다. GitHub 가 작성자 승인을 막는다 |
| `rv-N` · `ap-N` · `.claude/worktrees/gac-N` 이 남음 | `git worktree list` 로 보고 `git worktree remove --force <경로>` 뒤 `git worktree prune`. `Directory not empty` 면 `rm -rf` 뒤 prune |
| "이미 worktree 세션 안" | `ExitWorktree(action: "keep")` 로 나온 뒤 다시 |
| 새 worktree 에서 `npm test` 가 모듈을 못 찾음 | 그 폴더에서 `npm ci`. worktree 마다 `node_modules` 가 따로다 |
| `/gachi:` 자동 완성이 없음 | 저장소 폴더에서 열었는지 · 신뢰 수락했는지 · `claude plugin list` 에 있는지. 없으면 위 "설치" |
| `plugin update` 가 `not installed` | 설치 기록이 없다. 위 "설치" 의 `--scope project` 한 번 |
| 머지했는데 Mattermost 알림이 없음 | 루트(worktree 면 그 루트) `.env` 에 `MM_WEBHOOK_URL` 이 없다. `merge-pr` 이 수동 명령을 출력해 준다 |
| Linear 도구가 안 보임 | `/mcp` → `linear` 인증 |
| 새 버전인데 옛 동작 | 세션을 다시 열거나 `/reload-plugins`. 받은 버전은 `claude plugin list` 로 |

## 고치기

스킬 본문은 `plugins/gachi/skills/<이름>/SKILL.md` 하나씩이다. 고칠 때는 `/create-issue` 로 chore 이슈 → `<계정명>/gac-N` 브랜치 → `claude plugin validate .` 와 `claude plugin validate plugins/gachi` (경고 `version 없음` 은 의도. `--strict` 는 이 경고를 오류로 바꾸니 쓰지 않는다) → dev PR, 리뷰어는 전원. 머지되면 각자 다음 세션에 받는다.
