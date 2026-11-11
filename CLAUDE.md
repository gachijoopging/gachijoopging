# 가치줍깅 — Claude Code

작업 지침은 `AGENTS.md` 에 있다. 먼저 읽는다.

이 파일은 Claude Code 전용 항목만 담는다. 규칙을 두 곳에 적으면 반드시 한쪽이 틀려지므로,
프로젝트 규칙은 `AGENTS.md` 한 곳에만 있다.

@AGENTS.md

## 이 저장소의 스킬

| 스킬 | 언제 쓰나 |
|---|---|
| `/create-issue <작업 설명>` | Linear 일감을 만들 때. 중복 검사 후 폴더 오너에게 배정한다 |
| `/review-pr [번호\|URL ...] [초안만]` | 열린 PR/MR 을 골라 리뷰하고 요약 코멘트를 하나씩 단다. 승인·머지는 하지 않는다 |
| `/gachi:ship-issue [GAC-N]` | 내 Linear 이슈를 골라 이슈 worktree 에서 계획 → 테스트 먼저 구현(서브에이전트) → 검증 → PR |
| `/gachi:review-pr [번호 ...]` | 내가 리뷰 요청된 PR 을 새 에이전트가 비판적으로 리뷰하고 `gh pr review` 로 올린다. 필수 수정 없고 내 PR 아니면 Approve |
| `/gachi:apply-pr [번호]` | 작성자가 내 PR 에 받은 리뷰 지적을 반영하고 push → 셀프 점검 → 리뷰어에게 재리뷰 요청. 남의 PR 엔 쓰지 않는다 |
| `/gachi:merge-pr [번호]` | 승인·체크 초록인 PR 을 `dev` 는 squash, `main` 은 merge commit 으로 머지. 알림은 훅이 보낸다 |

`/gachi:*` 는 팀 플러그인(`plugins/gachi`)이다. 설치·업데이트·막히는 것은 `plugins/gachi/README.md`.
Linear 접근은 각자 OAuth 로 붙인다. 연결 방법은 `docs/conventions.md` §Linear 연결.

## 이 저장소의 에이전트

| 에이전트 | 역할 |
|---|---|
| `issue-planner` | 폴더 오너십으로 일감을 쪼개고 완료 조건을 검증 (읽기 전용, 생성하지 않는다) |
| `pr-creator` | 검증된 브랜치를 규칙에 맞는 PR 로 발행. 머지는 하지 않는다. `gachi:ship-issue` 가 부른다 |
| `backend-guard` | `backend/` 코드를 `backend/docs/02-conventions.md` 에 대조 (읽기 전용). `gachi:review-pr` · `ship-issue` 가 부른다 |
| `screen-builder` | `docs/screens/<번호>.md` 대로 화면을 구현. `design-system` 컴포넌트만 쓴다 |
| `notifier` | Mattermost 알림 발송 전담. 훅이 못 잡은 것만 보낸다 |

## 알림

`.claude/hooks/notify-push.mjs` 가 `git push`·`gh pr create`·`gh pr merge` 를 자동으로 잡는다.
**평소에는 아무것도 하지 않아도 된다.**

훅을 거치지 않은 경우(GitHub 웹에서 직접 머지, 맨 `git`/`gh`)에만 `notifier` 에이전트를 부른다.
보내는 것은 셋뿐이다 — `dev` 반영 · `main` 반영(배포) · 리뷰어 지정. 규칙은 `docs/conventions.md` §알림.

## 작업 시작 전 체크

- `docs/feature-scope.md` — 결정된 것. 다른 문서와 어긋나면 여기가 맞다
- `CONTEXT.md` — 용어. 코드·문서·대화의 이름은 여기 것을 쓴다
- 내 폴더 문서 1개 — `backend/CLAUDE.md` · `design-system/CLAUDE.md` · `docs/screens/<번호>.md`

`docs/` 전체를 읽지 않는다. 도메인별로 쪼개 놓은 이유가 그것이다.
