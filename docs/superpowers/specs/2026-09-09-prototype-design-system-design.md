# HTML 프로토타입 디자인 시스템 적용 설계

## 목표

`feat/html-prototype`의 43개 화면 정적 프로토타입이 최신 디자인 시스템의 토큰,
공통 컴포넌트 형태, 배치와 UX 계약을 같은 방식으로 보이게 한다.

## 범위와 기준

- 통합 브랜치 `feat/prototype-design-system`은 `feat/html-prototype`에서 분기한다.
- `chore/design-system-revision-impl`을 병합한다. 병합 뒤 `docs/screens/`와
  `design-system/README.md`를 화면과 디자인의 정본으로 삼는다.
- 프로토타입은 계속 `prototype/gachijoopging.html` 한 파일과 순수 HTML/CSS/JS로
  동작한다. React Native 컴포넌트를 실행하거나 새 프레임워크를 추가하지 않는다.
- 지도, 달력, 채팅, 카메라, 미디어처럼 기능 모델에 묶인 UI는 기존 화면 렌더러에 둔다.
  공통 시각·조작 규칙만 디자인 시스템에 맞춘다.

## 구현 설계

### 통합

디자인 시스템 브랜치를 먼저 병합하고, 화면 설계 문서 경로 충돌은 최신
`docs/screens/`를 유지한다. HTML 프로토타입 파일과 테스트 파일은 프로토타입
브랜치의 구현을 기준으로 유지한다.

### 공통 시각 계층

`gachijoopging.html`의 `:root` 토큰을 디자인 시스템의 colors, spacing, radius,
typography 값으로 맞춘다. Pretendard는 병합된 로컬 폰트 파일을 상대 경로로
불러오므로 인터넷 연결 없이 렌더링한다.

기존 공통 CSS와 생성 함수를 다음 계약에 맞춘다.

- `page`와 `iconButton`: `AppHeader`와 같은 표면 원형 뒤로가기, 20px 굵은 제목,
  선택 액션 슬롯을 쓴다.
- `button`, `field`, `card`, `banner`, `listRow`: 공개 컴포넌트의 색상, 모서리,
  오류, 위험, 비활성, 최소 48px 조작 영역을 쓴다.
- `nav`: 다섯 목적지 중 가운데 줍깅을 돌출 라임 액션으로 표시하고 선택 상태와
  탐색 상태를 유지한다.
- 시트와 확인 UI: `BottomSheet`와 `Dialog`의 표면, 스크림, 버튼 위계를 따른다.

화면별 렌더러는 공통 함수를 계속 사용한다. 따라서 43개 화면을 다시 작성하지 않고,
공통 계층 변경이 전체 화면에 적용된다.

### 검증

`prototype/prototype.test.mjs`는 다음을 검증한다.

- 로컬 Pretendard와 디자인 시스템 핵심 토큰을 사용한다.
- 헤더, 5탭 가운데 액션, 버튼·필드의 최소 터치와 상태 클래스가 존재한다.
- 43개 화면 등록·렌더러·오프라인 실행·시트 상태 검증은 계속 유지한다.

브라우저에서 시작, 로그인 오류, 홈, 설정, 활동 시작 시트를 확인한다. 이는
디자인 시스템의 시작/폼/root tab/list-overlay 레시피를 각각 대표한다.

## 비목표

- 정적 HTML을 React Native 또는 Expo로 변환하지 않는다.
- HTML과 TypeScript 토큰의 런타임 동기화 도구를 만들지 않는다.
- 도메인 API, 실제 인증, 지도·카메라·채팅 구현을 추가하지 않는다.
