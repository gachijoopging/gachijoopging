# 가치줍깅

크루 단위 플로깅 앱. 옛 모노레포 `gachijupging` 에서 갈라져 나왔고, 그쪽은 읽기 전용 보존이다.
배포 산출물은 app(React Native, Android) · backend(Spring Boot) · ai(FastAPI) 셋이고, design-system 은 앱이 의존하는 패키지다. 서버는 Lightsail VM 한 대다(ADR-0005).

이 파일이 이 저장소에서 일하는 **모든 AI 에이전트의 단일 진입점**이다. Claude Code · Codex · Cursor 등 도구와 무관하게 이 파일이 먼저다.
프로젝트 규칙은 여기 한 곳에만 있다. `CLAUDE.md` 는 Claude Code 전용 항목(스킬·에이전트·알림)만 담는다.

## 지시 우선순위

충돌하면 위쪽이 이긴다.

1. 사용자의 현재 요청
2. 바꿀 파일에 더 가까운 지침 (예: `backend/CLAUDE.md` · `design-system/CLAUDE.md`)
3. `docs/feature-scope.md` — 결정된 것. 다른 문서와 어긋나면 여기가 맞다
4. 이 파일
5. `docs/` 아래 도메인 문서
6. 그 영역의 기존 관례

우선순위로 풀리지 않는 충돌은 **멈추고 묻는다.**

## 문서 읽는 규칙

**`docs/` 전체를 읽지 않는다.** 화면만 44개다. 작업 유형별로 읽을 것만 읽는다.

| 무엇을 하는가 | 읽을 것 |
|---|---|
| 처음 이 저장소를 만짐 | `docs/feature-scope.md` → `CONTEXT.md` |
| 화면 구현 | `docs/screens/<번호>-<이름>.md` 1개 → `docs/openapi.yaml` 의 해당 경로 |
| 계약 변경 | `docs/openapi.yaml` → 그 경로를 쓰는 화면 문서 1개 |
| 백엔드 도메인 | `docs/ERD.md` → `backend/docs/01-구조.md` → `backend/docs/02-conventions.md` |
| 실시간·소켓 | `docs/realtime.md` |
| 배포·환경 변수 | `docs/operations.md` |
| 이슈·브랜치·PR | `docs/conventions.md` |
| 제품 동작이 궁금 | `docs/feature-scope.md` 의 해당 절 |

## 문서 (정본은 docs/)

- 왜 만드나 → `intent.md` · 말 → `CONTEXT.md` (용어집. 코드·문서·대화의 이름은 여기 것을 쓴다)
- 무엇을 만드나, 결정과 이유 → `docs/feature-scope.md` · 되돌리기 어려운 결정 → `docs/adr/`
- 화면 → `docs/screens.md` · 테이블 → `docs/ERD.md` · HTTP 계약 → `docs/openapi.yaml` · 실시간 → `docs/realtime.md`
- 백엔드 도메인 배치·소유 테이블·담당 경로 → `backend/docs/01-구조.md`
- 커밋·브랜치·PR·이슈 → `docs/conventions.md` · 배포·환경 변수·장애 → `docs/operations.md`

결정은 `feature-scope.md` 표에, ADR 은 세 조건(되돌리기 어렵고·맥락 없이는 놀랍고·실제 트레이드오프)이 모두 맞을 때만. 셋째 장소를 만들지 않는다.

## 작업 시 주의

- 작업 브랜치는 `dev`. `main` 에 직접 커밋하지 않는다. `feat → dev` 는 squash, `dev → main` 은 merge commit
- 커밋 scope 는 폴더 이름: `feat(backend/crew):` · `fix(app):` · `chore(infra):`
- 계약(`docs/openapi.yaml`)을 바꾸면 같은 PR 에서 앱·백엔드 양쪽을 고친다. CI 가 `redocly lint` 로 검증한다
- 팀 전원 Windows 다. `.sh` 는 LF, 대소문자 오류는 CI(Linux)에서만 드러난다
- 한글이 든 `.ps1` 은 UTF-8 BOM. PowerShell 5.1 은 BOM 없으면 cp949 로 읽어 구문 오류로 나타난다
- `design-system` 의 색을 바꿨으면 그 폴더에서 `npm test`. 자세한 규칙은 `design-system/CLAUDE.md`
- 이슈를 Done 으로 옮기기 전에 `docs/conventions.md` §완료의 정의 넷을 모두 만족해야 한다. 여기에 옮겨 적지 않는다 — 정본은 그쪽이다

## 코딩 지침

LLM 이 자주 내는 실수를 줄이기 위한 행동 지침이다. 프로젝트 규약과 충돌하면 규약이 우선한다.

**1. Think Before Coding** — 가정을 드러낸다. 해석이 여럿이면 고르지 말고 제시한다. 더 단순한 길이 있으면 말한다. 불명확하면 멈추고 묻는다.

**2. Simplicity First** — 요청된 것만. 한 번 쓰는 코드에 추상화를 만들지 않는다. 요청되지 않은 유연성·설정을 넣지 않는다. 불가능한 시나리오의 오류 처리를 쓰지 않는다. 200줄이 50줄이 될 수 있으면 다시 쓴다.

**3. Surgical Changes** — 바꿔야 하는 것만 건드린다. 인접 코드·주석·포맷을 "개선" 하지 않는다. 기존 스타일을 따른다. 내 변경으로 안 쓰게 된 import·변수·함수는 지우고, 원래 있던 죽은 코드는 언급만 한다. 바뀐 줄마다 요청으로 거슬러 올라가야 한다.

**4. Goal-Driven Execution** — 성공 기준을 먼저 정한다. "검증 추가" → "잘못된 입력 테스트를 쓰고 통과시킨다". "버그 수정" → "재현 테스트를 쓰고 통과시킨다". 여러 단계면 `1. [단계] → 확인: [검사]` 로 짧게 적는다.

## 주석 규칙 (전 언어)

- 동작 방식(How)·변경 이력·이슈 번호를 주석에 쓰지 않는다. 동작은 이름과 구조로 드러낸다
- 주석은 정책의 이유(Why)와 외부 API 버그·하드웨어 제약 같은 예외 사유에만
- 이미 적용된 Flyway migration 은 주석도 checksum 에 들어가므로 손대지 않는다

## 전역 제약

`docs/feature-scope.md` 에서 온 불변식이다. 코드를 쓸 때 예외 없이 적용된다.

- **위치는 필터 4개를 통과한 점만** 경로·소켓에 쓴다 — 오차 30m 초과 버림 · 초속 5m 초과 버림 · 최근 3~5점 평활 · 유효 걸음수가 있을 때만 걸음×0.7m 와 대조해 30% 초과 시 보정
- **걸음수 미측정은 `null` 이고 0걸음과 다르다.** 0걸음 때문에 거리를 0으로 보정하지 않는다. 미측정·권한 없음이어도 시작·줍기·종료를 막지 않는다
- **카테고리 7종 고정** — 담배꽁초·캔·플라스틱·종이·유리·비닐·일반. AI 는 사진에서 찾은 물체를 **전부** 돌려주고 앱이 카테고리별 수량으로 묶는다
- **한 사람은 크루 하나에만 소속된다.** 동네(hood) 개념은 없다
- **크루장은 한 명이고 `crews.leader_id` 로만 대조한다.** 운영진 층은 없다
- **활동은 오프라인이어도 기기에서 즉시 종료된다.** 줍기 → 종료 순서로 동기화하며, 미저장 데이터를 재실행·오류·다음 시작 때문에 지우지 않는다
- **Secret 을 문서·코드·커밋에 넣지 않는다.** 실제 API 키·DB 비밀번호·웹훅 URL·JWT 대신 `{apiKey}` 같은 변수명을 쓴다. 값은 각자 `.env`, 키 이름만 `docs/operations.md`

## 이 프로젝트에서 하지 않는 것

요청받아도 아래는 범위 밖이다. 필요하면 먼저 `docs/feature-scope.md` 에 결정을 추가한다.

```
무전(LiveKit) · 조(소그룹) · 동네(hood) · 친구 요청·수락·친구 목록 · 사용자 검색
모임 만들기·찾기·가입·관리 · 초대 코드·초대 링크 · 음성 입력 · 경로 맞춤(map matching)
iOS · 관리자 웹 · 크루 웹 · 게시물 수정 · 1:1 채팅 · 기존 데이터 이관
```

**담당 폴더 밖을 고치지 않는다.** 누가 어느 폴더를 갖는지는 `.claude/skills/create-issue/SKILL.md` §담당 에 있다 — 여기 옮겨 적지 않는다.

## backend (Java/Spring)

- 기준: Java 21 · Spring Boot 3.5.x · Gradle Wrapper 8.10 · PostgreSQL 16 + PostGIS(Supabase) · Spring Data JPA/Hibernate · Jakarta. 정본은 `backend/build.gradle`·`gradle-wrapper.properties`·`infra/`. Spring Boot 2.x·`javax.*` 패턴을 제안하지 않는다
- Entity 생성·상태 변경과 CRUD 는 Spring Data JPA, 조회 조건 조합은 QueryDSL, PostGIS·통계·Export 는 JDBC/native/projection
- Entity 와 DTO 분리. 도메인 간 연관관계 대신 식별자 참조. 새 연관관계는 같은 도메인 안에서만
- Entity Lombok 은 `@Getter` + `@NoArgsConstructor(access = PROTECTED)`. `@Setter`·`@Data`·`@ToString`·`@EqualsAndHashCode` 금지. Builder 는 필수값·불변조건을 우회하지 않을 때만
- Bean 생성자 주입은 순수 `final` 할당이면 `@RequiredArgsConstructor`, 검증·변환이 있으면 명시적 생성자. 필드 주입 금지
- `/crew/...` 는 호출자의 소속 크루를 주입받는다. 크루 id 를 경로에 넣지 않는다. 크루장 전용은 `crews.leader_id` 대조
- 코드 규약 상세는 `backend/docs/02-conventions.md`

## app (React Native, Android)

폴더별 명령과 구조는 `mobile/CLAUDE.md`.

- 화면은 `docs/screens.md` 번호(예: 4-3)로 부르고, 데이터는 `docs/openapi.yaml` 의 `example` 을 목으로 쓴다
- UI 는 `design-system` 컴포넌트만. 색·간격·반경을 직접 쓰지 않는다. `Screen` 으로 감싸고, 누르는 것엔 `useRipple()`
- 지도는 카카오맵 Android SDK 네이티브 모듈. Expo Go 는 못 쓰고 개발 빌드로 돈다
- `applicationId` 는 `site.gachijoopging.app` 고정. Firebase·카카오가 이 값으로 대조한다
- 위치는 `docs/feature-scope.md` "위치 품질" 의 필터 4개를 통과한 점만 경로·소켓에 쓴다
- 상태·훅·유틸은 Jest 단위 테스트. 화면은 카탈로그에서 눈으로 본다

## ai (FastAPI)

- 줍기 사진에서 쓰레기를 탐지해 카테고리 7종으로 돌려준다. 앱과의 계약은 `docs/openapi.yaml` 이고, 요청·응답을 여기서 임의로 바꾸지 않는다
- 사진 한 장에서 찾은 물체를 **전부** 돌려준다. 최고 신뢰도 하나만 남기지 않는다 (`docs/feature-scope.md` §AI 줍기)
- 신뢰도를 정답 확률 %로 표현하지 않는다. 0.7 미만은 "확인 필요"로만 표시한다
- 모델 개선 실험 수치(`ai/experiment-log.md`)와 실환경 정확도를 구별해 말한다. 진행 상황은 `ai/progress.md`
- 라벨링 규칙은 `ai/docs/labeling-guide.md`. 데이터셋·가중치는 커밋하지 않는다

## infra

- 손으로 알릴 것은 `node infra/notify.mjs "메시지"`. 웹훅 URL 을 직접 `curl` 하지 않는다 — 쉘 히스토리에 남는다
- 환경 변수 **키 목록**의 정본은 `docs/operations.md`. 값은 어디에도 커밋하지 않는다
- 루트 `.env` 는 각자의 로컬 설정, `infra/.env` 는 서버에 올라가는 운영 값이다. 섞지 않는다
- 서버 구성은 ADR-0005 로 정해졌다 — Lightsail VM 한 대에 docker compose, 스테이징 없음. 구성·배포·감시는 `docs/operations.md`
