# 디자인 시스템 화면 커버리지

`docs/screens/`가 요구사항의 정본이다. 이 표는 그 화면들이 디자인 시스템을 어떻게
재사용하는지 추적한다. `feature shared`와 `screen-specific`은 공통 토큰·레시피는 쓰되
도메인 렌더링을 `design-system`으로 옮기지 않는다는 뜻이다.

| 화면 | 분류 | 재사용 컴포넌트 | 레시피 | 디자인 시스템 미결 |
|---|---|---|---|---|
| 1-1 시작 | screen-specific | Screen, Button translucent, Txt | Root tab | 없음 |
| 1-2 로그인 | variant | AppHeader, Field, Chip, Banner, Button | Form | 없음 |
| 1-3 회원가입 | variant | AppHeader, Field, Checkbox, Banner, Button | Form | 없음 |
| 1-4 닉네임 | variant | AppHeader, Field, Button | Form | 없음 |
| 1-5 비밀번호 재설정 | variant | AppHeader, Field, Button, Banner | Form | 없음 |
| 1-6 크루 만들기/가입 | screen-specific | Screen, Button, Card, Tabs | List/detail | 없음 |
| 1-7 크루 만들기 | variant | AppHeader, Field, Avatar, Button | Form | 없음 |
| 1-8 초대 코드 입력 | variant | AppHeader, Chip deep, Field, Button | Form | 없음 |
| 1-9 승인 대기 | screen-specific | Screen, Card, Button, Banner | Overlay | 없음 |
| 1-10 위치 권한 | screen-specific | Screen, Button, Banner | Overlay | 없음 |
| 2-1 홈 | screen-specific | BottomNav, Card, Tile, Progress, Badge | Root tab | 없음 |
| 2-2 활동 중인 크루원 | feature shared | AppHeader, Avatar, Badge, ListRow | List/detail | 지도·마커는 기능 UI |
| 2-3 알림 | feature shared | AppHeader, List, ListRow, Badge, EmptyState | List/detail | 알림별 원 아이콘 배경은 기능 조합 |
| 3-1 크루 | screen-specific | BottomNav, Card, Tile, ListRow | Root tab | 없음 |
| 3-2 크루 정보 | feature shared | AppHeader, Avatar, Card, Tabs, ListRow | List/detail | 크루 소개/사진 조합은 기능 UI |
| 3-3 초대 코드 | feature shared | AppHeader, Card, Button, Snackbar | Overlay | QR 렌더링은 기능 UI |
| 3-4 크루 기록 | feature shared | AppHeader, Tabs, Card, Tile, EmptyState | Metrics | 막대 그래프는 기능 UI |
| 3-5 공지 목록 | feature shared | AppHeader, List, ListRow, EmptyState, Badge | List/detail | 없음 |
| 3-6 공지 상세 | feature shared | AppHeader, Card, ListRow, BottomSheet, Snackbar | List/detail | 댓글 렌더링은 기능 UI |
| 3-7 크루 채팅 | feature shared | AppHeader, Field, IconButton, Badge, Snackbar | Form | 말풍선·소켓 목록은 기능 UI |
| 3-8 가입 요청 관리 | feature shared | AppHeader, ListRow, Avatar, Button, Dialog | List/detail | 없음 |
| 3-9 활동 달력 | feature shared | AppHeader, Tabs, Card, EmptyState | Metrics | 7열 달력 격자는 기능 UI |
| 3-10 크루 정보 수정 | variant | AppHeader, Avatar xl, Field, Tile, Button, BottomSheet, Dialog | Form | 직접 숫자 입력 검증은 화면 계약 |
| 3-11 크루원 관리 | feature shared | AppHeader, ListRow, Avatar, BottomSheet, Dialog | List/detail | 역할별 액션은 기능 UI |
| 3-12 공지 수정 | variant | AppHeader, Field, Button, Dialog, Snackbar | Form | 없음 |
| 4-1 줍깅 대기 | screen-specific | BottomNav, Card, Button, EmptyState | Root tab | 빈 상태 캐릭터는 기능 UI |
| 4-2 활동 시작 시트 | feature shared | BottomSheet, Tile, Switch, Button, Banner | Overlay | Tile 전체 토글 제어는 화면 조합 |
| 4-3 활동 중 | screen-specific | Card, Chip, Badge, Dot, IconButton, Txt | Metrics | 지도·경로·OS 알림·전용 하단 바는 기능 UI |
| 4-4 사진 촬영 | screen-specific | IconButton translucent, CaptureButton, Button, Snackbar | Overlay | 카메라 프리뷰·가이드는 기능 UI |
| 4-5 AI 분류 확인 | feature shared | AppHeader, Card, NumberStepper, Button, Banner | Form | 카테고리 격자·AI 배지는 기능 UI |
| 4-6 빠른 줍기 시트 | feature shared | BottomSheet, NumberStepper, Button, Snackbar | Overlay | 카테고리 격자·최근 작업은 기능 UI |
| 4-7 활동 요약 | feature shared | Card, Tile, Button, Snackbar | Metrics | 정지 지도·경로는 기능 UI |
| 5-1 피드 | screen-specific | BottomNav, Card, Avatar, Chip, Badge, EmptyState | Root tab | 게시물 사진/카드는 기능 UI |
| 5-2 게시물 상세 | feature shared | AppHeader, IconButton, Card, Chip, BottomSheet, Snackbar | List/detail | 사진 페이저·댓글은 기능 UI |
| 5-3 활동 기록 상세 | feature shared | AppHeader, Card, Tile, Chip, Button | Metrics | 지도·기록 시각화는 기능 UI |
| 5-4 타인 프로필 | feature shared | AppHeader, Avatar, Tabs, Card, List, BottomSheet | List/detail | 활동 달력·게시물 그리드는 기능 UI |
| 5-5 내 정보 | feature shared | BottomNav, Avatar, Tabs, Card, Tile, IconButton | Root tab | 활동/게시물 그리드는 기능 UI |
| 5-6 게시물 작성 | variant | AppHeader, Field, Button, Dialog, Snackbar | Form | 다중 사진 선택·정렬은 기능 UI |
| 5-7 설정 | variant | AppHeader, ListRow, Switch, Button, Dialog, Snackbar | List/detail | 행 전체 토글 조합은 화면 책임 |
| 5-8 프로필 수정 | variant | AppHeader, Avatar xl, Field, BottomSheet, Button, Dialog | Form | 사진 선택은 기능 UI |
| 5-9 차단 관리 | feature shared | AppHeader, List, ListRow, Avatar, Dialog, EmptyState | List/detail | 없음 |
| 6-1 신고 | variant | AppHeader, Card, Avatar, SelectRow, Field, Button, Banner, Snackbar | Form | 대상 썸네일은 기능 UI |
| 6-2 신고 처리 | feature shared | AppHeader, Card, ListRow, Button, Dialog, Snackbar | List/detail | 신고 대상별 미리보기는 기능 UI |

## 경계 검증

- 이 표에 없는 새 제네릭 컴포넌트를 만들기 전에, 최소 두 화면이 같은 API·상태·접근성
  계약을 공유하는지 확인한다.
- 화면이 같은 구성 요소를 보이더라도 지도·카메라·채팅·미디어·차트처럼 데이터와 상호작용
  모델이 다른 경우에는 기능 레이어에 둔다.
- 각 화면의 API·문구·상태의 미결은 해당 `docs/screens/<화면>.md`의 `## 미결` 절을
  따른다. 디자인 시스템 차원의 추가 결정을 추정하지 않는다.

## 레거시 APK 시각 대조 (2026-09-09)

`docs/screens/`를 정본으로 두고 APK는 형태·간격·상태를 확인하는 시각 자료로만 사용했다.

| APK 장면 | 확인한 공통 패턴 | 판정 |
|---|---|---|
| 시작 | 전체 배경 사진, 카카오 CTA, 반투명 보조 CTA | `Button` 변형으로 충족. 사진은 화면 자산 |
| 이메일 로그인 | 원형 표면 뒤로가기, 끝 장식이 있는 입력란, 전체 너비 CTA | `AppHeader`, `Field.endAdornment`, `Button`으로 충족 |
| 로그인 오류 | 입력란의 빨간 테두리와 인라인 오류 문구 | 기존 `Field.error`로 동일 |
| 홈 | 4개 목적지 사이의 돌출된 라임 시작 액션 | `BottomNav.startAction`으로 보완 |
| 설정 | 표면 카드 행, 원형 아이콘 배경, 스위치, 위험 행 | `ListRow`, `Switch`, 위험 변형으로 충족 |
| 삭제 확인 | 어두운 스크림, 큰 표면 패널, 취소·주요 액션 | 기존 `Dialog`와 버튼 변형으로 충족 |
| 위치 권한 | OS 권한창과 별도의 안내 화면 | OS 권한창은 네이티브 책임, 안내는 `Screen`, `Button` 조합 |

지도·달력·채팅·카메라·미디어처럼 데이터와 상호작용이 결합된 UI는 APK와 닮았더라도
기능 레이어에 유지한다.
