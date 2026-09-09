# HTML 프로토타입 디자인 시스템 적용 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정적 HTML 프로토타입의 43개 화면이 최신 디자인 시스템의 공통 시각·배치·상태 계약을 사용하게 한다.

**Architecture:** `chore/design-system-revision-impl`을 통합 브랜치에 병합한 뒤 단일 HTML의 CSS 변수와 공통 DOM 팩터리를 최신 토큰·레시피에 맞춘다. 각 화면 렌더러는 유지해 공통 계층의 변경이 모든 화면에 적용되게 한다.

**Tech Stack:** 정적 HTML, CSS, 브라우저 DOM API, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-09-prototype-design-system-design.md`

## Global Constraints

- `docs/screens/`와 `design-system/README.md`가 정본이다.
- React Native/Expo 의존성이나 HTML 런타임 토큰 변환 도구를 추가하지 않는다.
- 외부 URL 없이 로컬 Pretendard 자산만 상대 경로로 쓴다.
- 모든 독립 조작은 최소 48px 터치 영역을 유지한다.
- 지도·달력·채팅·카메라·미디어 UI는 기존 화면 렌더러가 소유한다.

---

### Task 1: 디자인 시스템 브랜치 통합과 화면 설계 경로 정리

**Files:**
- Merge: `chore/design-system-revision-impl`
- Modify: `prototype/gachijoopging.html`
- Modify: `prototype/prototype.test.mjs`

**Interfaces:**
- Consumes: 기존 `screenById` 43개 항목과 `docs/screens/`.
- Produces: 최신 디자인 시스템 파일과 43개 화면 설계 경로를 참조하는 프로토타입.

- [ ] **Step 1: 기준 테스트 실행**

Run: `node --test prototype/prototype.test.mjs`

Expected: 9개 테스트 통과.

- [ ] **Step 2: 디자인 시스템 브랜치 병합**

Run:

```powershell
git merge --no-ff chore/design-system-revision-impl -m "merge: apply design system to prototype"
```

`docs/화면설계/`와 `docs/screens/` 충돌에서는 최신 `docs/screens/`를 유지한다. `prototype/` 파일은 프로토타입 구현을 기준으로 유지한다.

- [ ] **Step 3: 실패하는 최신 문서 경로 테스트 작성**

`prototype/prototype.test.mjs`의 화면 등록 정규식을 다음으로 바꾼다.

```js
const entries = [...html.matchAll(/id:\s*'([1-6]-\d+)'[\s\S]*?spec:\s*'(docs\/screens\/[^']+\.md)'/g)]
```

- [ ] **Step 4: 실패 확인 후 43개 spec 경로 교체**

Run: `node --test prototype/prototype.test.mjs`

Expected: 기존 `docs/화면설계/` 경로 때문에 실패.

`prototype/gachijoopging.html`의 43개 `spec` 값만 `docs/screens/` 경로로 바꾸고 같은 명령을 다시 실행한다.

Expected: 전체 통과.

- [ ] **Step 5: 커밋**

```powershell
git add docs design-system prototype
git commit -m "merge: align prototype with design system docs"
```

### Task 2: 토큰과 공통 HTML 컴포넌트를 디자인 시스템에 맞추기

**Files:**
- Modify: `prototype/gachijoopging.html:8-160`
- Modify: `prototype/gachijoopging.html:166-190`
- Modify: `prototype/prototype.test.mjs`

**Interfaces:**
- Consumes: `design-system/tokens/`와 `design-system/README.md`.
- Produces: `page`, `button`, `iconButton`, `card`, `field`, `listRow`, `banner`가 공유 토큰과 접근성 규칙을 쓰는 공통 계층.

- [ ] **Step 1: 실패하는 디자인 계약 테스트 작성**

```js
test('uses local design-system typography and shared primitives', () => {
  assert.match(html, /@font-face[\s\S]*Pretendard-Regular\.ttf/)
  assert.match(html, /font-family:\s*'Pretendard'/)
  assert.match(html, /\.screen-header h1[\s\S]*font-size:\s*20px/)
  assert.match(html, /\.icon-button[\s\S]*background:\s*var\(--surface\)/)
  assert.match(html, /\.field--error/)
  assert.match(html, /\.button--danger/)
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test prototype/prototype.test.mjs`

Expected: 로컬 Pretendard와 오류 필드 계약이 없어 실패.

- [ ] **Step 3: 최소 구현**

`<style>`에 다음 로컬 폰트를 추가하고 `body`에서 사용한다.

```css
@font-face {
  font-family: 'Pretendard';
  src: url('../design-system/assets/fonts/Pretendard-Regular.ttf') format('truetype');
  font-weight: 400;
}
```

`:root`의 색·간격·반경을 디자인 시스템 값으로 맞춘다. `button`에는 primary, deep, danger, ghost, translucent를, `field`에는 선택적 `error` 인수와 `field--error` 오류 문구를 추가한다. `page`는 20px 굵은 제목과 표면형 `iconButton` 뒤로가기를 제공한다. 기존 호출부가 계속 동작하도록 새 인수는 선택값으로 둔다.

- [ ] **Step 4: 통과 확인**

Run: `node --test prototype/prototype.test.mjs`

Expected: 기존 테스트와 새 디자인 계약 테스트가 모두 통과.

- [ ] **Step 5: 커밋**

```powershell
git add prototype/gachijoopging.html prototype/prototype.test.mjs
git commit -m "feat(prototype): apply shared design primitives"
```

### Task 3: 5탭 중앙 액션과 오버레이 레시피 적용

**Files:**
- Modify: `prototype/gachijoopging.html:80-100`
- Modify: `prototype/gachijoopging.html:606-640`
- Modify: `prototype/prototype.test.mjs`

**Interfaces:**
- Consumes: `state.currentScreenId`, `navigate(id)`, `renderBottomNav()`, `openSheet(kind)`.
- Produces: 가운데 줍깅 액션의 선택·탐색 상태와 일관된 시트·확인 위계.

- [ ] **Step 1: 실패하는 5탭 중앙 액션 테스트 작성**

```js
test('keeps the raised plogging action in the five-tab navigation', () => {
  assert.match(html, /className:\s*'nav-action'/)
  assert.match(html, /navigate\('4-1'\)/)
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test prototype/prototype.test.mjs`

Expected: `nav-action`이 없어 실패.

- [ ] **Step 3: 최소 구현**

`renderBottomNav()`에서 `4-1` 항목을 `nav-action`으로 렌더링하고 현재 화면일 때만 `aria-current="page"`를 준다. 클릭은 `navigate('4-1')`을 호출한다. CSS는 라임 원형 액션을 탭 바보다 위로 올리되 버튼 전체의 최소 높이는 48px로 유지한다.

`renderSheet()`의 시트·확인 UI는 공통 표면·스크림·위험 액션 클래스를 사용한다. 도메인별 시트 내용과 상태 전이는 바꾸지 않는다.

- [ ] **Step 4: 통과 확인**

Run: `node --test prototype/prototype.test.mjs`

Expected: 5탭, 모달, 활동 시작·빠른 줍기 시트 검증을 포함해 전체 통과.

- [ ] **Step 5: 커밋**

```powershell
git add prototype/gachijoopging.html prototype/prototype.test.mjs
git commit -m "feat(prototype): align navigation and overlays"
```

### Task 4: 대표 화면 시각 검증과 최종 확인

**Files:**
- Verify: `prototype/gachijoopging.html`
- Verify: `prototype/prototype.test.mjs`

**Interfaces:**
- Consumes: Task 1-3의 통합 HTML과 테스트.
- Produces: 시작·폼·루트 탭·목록·오버레이 레시피 검증 증거.

- [ ] **Step 1: 자동 검증**

Run:

```powershell
node --test prototype/prototype.test.mjs
git diff --check
```

Expected: 모든 테스트 통과, 공백 오류 없음.

- [ ] **Step 2: 브라우저 시각 확인**

`prototype/gachijoopging.html`을 열어 1-1 시작, 1-2 로그인 오류, 2-1 홈, 5-7 설정, 4-2 활동 시작 시트를 확인한다. 표면형 헤더, 필드 오류, 라임 가운데 탭, 시트 스크림과 위험 액션 위계를 확인한다.

- [ ] **Step 3: 최종 커밋 확인**

Run:

```powershell
git status --short
git log --oneline feat/html-prototype..HEAD
```

Expected: 계획된 커밋만 존재하고 의도하지 않은 파일이 없다.

