# 가치줍깅

## 이 저장소

크루 단위 플로깅 앱. 옛 모노레포 `gachijupging` 에서 갈라져 나왔고, 그쪽은 읽기 전용 보존이다.
배포 산출물은 app(React Native, Android) · backend(Spring Boot) · ai(FastAPI) 셋이고, design-system 은 앱이 의존하는 패키지다. 서버 구성은 미결이다.

## 문서 (정본은 docs/)

- 왜 만드나 → `intent.md` · 말 → `CONTEXT.md` (용어집. 코드·문서·대화의 이름은 여기 것을 쓴다)
- 무엇을 만드나, 결정과 이유 → `docs/feature-scope.md` · 되돌리기 어려운 결정 → `docs/adr/`
- 화면 → `docs/screens.md` · 테이블 → `docs/ERD.md` · HTTP 계약 → `docs/openapi.yaml` · 실시간 → `docs/realtime.md`
- 옛 백엔드 도메인별 유지·개명·끔 → `docs/backend-migration.md`
- 커밋·브랜치·PR·이슈 → `docs/conventions.md` · 배포·환경 변수·장애 → `docs/operations.md`

결정은 `feature-scope.md` 표에, ADR 은 세 조건(되돌리기 어렵고·맥락 없이는 놀랍고·실제 트레이드오프)이 모두 맞을 때만. 셋째 장소를 만들지 않는다.

## 작업 시 주의

- 작업 브랜치는 `dev`. `main` 에 직접 커밋하지 않는다. `feat → dev` 는 squash, `dev → main` 은 merge commit
- 커밋 scope 는 폴더 이름: `feat(backend/crew):` · `fix(app):` · `chore(infra):`
- 계약(`docs/openapi.yaml`)을 바꾸면 같은 PR 에서 앱·백엔드 양쪽을 고친다. CI 가 `redocly lint` 로 검증한다
- 팀 전원 Windows 다. `.sh` 는 LF, 대소문자 오류는 CI(Linux)에서만 드러난다
- 한글이 든 `.ps1` 은 UTF-8 BOM. PowerShell 5.1 은 BOM 없으면 cp949 로 읽어 구문 오류로 나타난다
- `design-system` 의 색을 바꿨으면 그 폴더에서 `npm test`. 자세한 규칙은 `design-system/CLAUDE.md`

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

## backend (Java/Spring)

- 기준: Java 21 · Spring Boot 3.5.x · Gradle Wrapper 8.10 · PostgreSQL 16 + PostGIS(Supabase) · Spring Data JPA/Hibernate · Jakarta. 정본은 `backend/build.gradle`·`gradle-wrapper.properties`·`infra/`. Spring Boot 2.x·`javax.*` 패턴을 제안하지 않는다
- Entity 생성·상태 변경과 CRUD 는 Spring Data JPA, 조회 조건 조합은 QueryDSL, PostGIS·통계·Export 는 JDBC/native/projection
- Entity 와 DTO 분리. 도메인 간 연관관계 대신 식별자 참조. 새 연관관계는 같은 도메인 안에서만
- Entity Lombok 은 `@Getter` + `@NoArgsConstructor(access = PROTECTED)`. `@Setter`·`@Data`·`@ToString`·`@EqualsAndHashCode` 금지. Builder 는 필수값·불변조건을 우회하지 않을 때만
- Bean 생성자 주입은 순수 `final` 할당이면 `@RequiredArgsConstructor`, 검증·변환이 있으면 명시적 생성자. 필드 주입 금지
- `/crew/...` 는 호출자의 소속 크루를 주입받는다. 크루 id 를 경로에 넣지 않는다. 크루장 전용은 `crews.leader_id` 대조
- 코드 규약 상세는 `backend/docs/02-conventions.md`

## app (React Native, Android)

앱 골격은 아직 없다. 화면은 docs/screens/ 가 확정된 뒤 만든다.

- 화면은 `docs/screens.md` 번호(예: 4-3)로 부르고, 데이터는 `docs/openapi.yaml` 의 `example` 을 목으로 쓴다
- UI 는 `design-system` 컴포넌트만. 색·간격·반경을 직접 쓰지 않는다. `Screen` 으로 감싸고, 누르는 것엔 `useRipple()`
- 지도는 카카오맵 Android SDK 네이티브 모듈. Expo Go 는 못 쓰고 개발 빌드로 돈다
- `applicationId` 는 `site.gachijoopging.app` 고정. Firebase·카카오가 이 값으로 대조한다
- 위치는 `docs/feature-scope.md` "위치 품질" 의 필터 4개를 통과한 점만 경로·소켓에 쓴다
- 상태·훅·유틸은 Jest 단위 테스트. 화면은 카탈로그에서 눈으로 본다
