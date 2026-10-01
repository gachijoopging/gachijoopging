# 가치줍깅 — Claude Code

작업 지침은 `AGENTS.md` 에 있다. 먼저 읽는다.

이 파일은 Claude Code 전용 항목만 담는다. 규칙을 두 곳에 적으면 반드시 한쪽이 틀려지므로,
프로젝트 규칙은 `AGENTS.md` 한 곳에만 있다.

@AGENTS.md

## 이 저장소의 스킬

| 스킬 | 언제 쓰나 |
|---|---|
| `/create-issue <작업 설명>` | Linear 일감을 만들 때. 중복 검사 후 폴더 오너에게 배정한다 |

Linear 접근은 각자 OAuth 로 붙인다. 연결 방법은 `docs/conventions.md` §Linear 연결.

## 이 저장소의 에이전트

| 에이전트 | 역할 |
|---|---|
| `issue-planner` | 폴더 오너십으로 일감을 쪼개고 완료 조건을 검증 (읽기 전용, 생성하지 않는다) |
| `pr-creator` | 검증된 브랜치를 규칙에 맞는 PR 로 발행. 머지는 하지 않는다 |
| `backend-guard` | `backend/` 코드를 `backend/docs/02-conventions.md` 에 대조 (읽기 전용) |
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
