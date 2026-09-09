# 가치줍깅 디자인 토큰 (React Native)

안드로이드 `mobile/app/src/main/res/values{,-night}/` 의 토큰을 React Native 로 이식한 것입니다.
앱이 의존하는 디자인 시스템 패키지입니다. 카탈로그는 확인용이며 화면 설계는 `../docs/screens/`에 있습니다.

```
tokens/colors.ts        색 (라이트 · 다크) · 주 채움 그라데이션
tokens/spacing.ts       간격 · 화면 여백 · 컨트롤 치수
tokens/radius.ts        모서리 반경
tokens/typography.ts    크기 · 행간 · 폰트
tokens/elevation.ts     그림자 · 테두리
src/theme.tsx           ThemeProvider · useTheme · useRipple · depth
src/components/         컴포넌트 17파일
tools/                  폰트 서브셋 유니코드 목록
src/Catalog.tsx         전 컴포넌트를 한 화면에 늘어놓은 카탈로그
contrast.test.ts        대비 불변식 검증
preview.mjs             토큰 명세 HTML 생성기
```

## 돌려보기

```bash
npm start          # Expo — 기기·에뮬레이터
npm run web        # 브라우저에서 카탈로그
npm test           # 대비 불변식 14건
npm run typecheck  # tsc --noEmit
npm run preview    # preview.html 다시 생성
```

Expo SDK 57 · React Native 0.86 · React 19.2. New Architecture 가 기본이라
`boxShadow` 가 그대로 동작합니다.

`npm run preview` 는 `MODULE_TYPELESS_PACKAGE_JSON` 경고를 냅니다. 루트에
`"type": "module"` 이 없어서인데, 넣으면 Expo 의 `babel.config.js` · `metro.config.js`
가 깨지므로 경고를 그대로 둡니다.

## 컴포넌트

| 파일 | 내보내는 것 | 원본 |
|---|---|---|
| `Text.tsx` | `Txt` | `type.xml` · 크기 11단 |
| `Icon.tsx` | `Icon` | 벡터 드로어블 59개 → Material Design Icons |
| `Button.tsx` | `Button` · `CaptureButton` | `bg_button_*` · `bg_soft_button` · `bg_capture_fab` |
| `Chip.tsx` | `Chip` | `bg_chip_*` 9종 → tone 하나 |
| `Card.tsx` | `Card` · `Tile` · `depth` | `bg_card*` · `bg_tile_*` |
| `Input.tsx` | `Field` | `bg_input_multiline` · `bg_input_error` |
| `Avatar.tsx` | `Avatar` · `toneForName` | `bg_circle_avatar*` · 아바타 6색 |
| `Badge.tsx` | `Badge` · `Dot` | `bg_unread_dot` · `bg_dot_orange` |
| `Banner.tsx` | `Banner` | `bg_banner_*` 3종 |
| `Sheet.tsx` | `BottomSheet` · `Dialog` | `bg_sheet` · `bg_sheet_handle` · `bg_scrim` |
| `Tabs.tsx` | `Tabs` · `BottomNav` | `bg_tab_selector` · `bg_nav_item_selected` |
| `ListRow.tsx` | `ListRow` · `SelectRow` | `bg_select_row_*` |
| `Progress.tsx` | `Progress` | `bg_progress_track` |
| `States.tsx` | `Loading` · `EmptyState` · `ErrorState` · `DashedBox` | `bg_dashed_box` |

원본 드로어블 88개가 컴포넌트 88개는 아닙니다 — `bg_circle_*` 22개는 대부분 같은
원의 크기 변형이고 `bg_chip_*` 9종은 채움 색만 다릅니다. prop 으로 접었습니다.

## 이식하면서 판단한 것

- **`bg_button_cta.xml` 이 존재하지 않는 `bg_button_primary_disabled` 를 참조합니다.**
  저장소 어디에도 그 파일이 없습니다. 기존 앱의 결함이라 고치지 않고, 비활성 상태를
  `track` 채움 + `hint` 잉크로 새로 정의했습니다.
- 원본은 `bg_soft_button` 에 반경 14, `bg_tile_round` 에 20 을 직접 박아 썼습니다.
  토큰 스케일에 없는 값이라 원본 간격 규약과 같은 올림 방향으로 각각
  `radius.field`(16) · `radius.cardSm`(22) 에 맞췄습니다.
- 원본 입력창은 여러 줄에 반경 18, 오류에 16 을 써서 같은 입력창이 상태에 따라
  모서리가 바뀌었습니다. 상태는 색으로만 말하도록 `radius.field` 로 통일했습니다.
- `bg_select_row_on` 의 테두리 2.5 는 토큰 스케일에 맞춰 2 로 내렸습니다.
- 점선 상자의 대시 패턴(8/5)은 재현하지 않았습니다. RN 은 대시 길이를 지정할 수
  없고, 정확한 패턴을 얻으려면 react-native-svg 가 필요한데 그만한 값은 아닙니다.

## 검증

```bash
node --test contrast.test.ts
```

의존성이 없습니다. Node 22.18+ 가 TypeScript 를 그대로 실행합니다.

색을 하나라도 바꿨으면 이걸 돌리세요. 대비는 손으로 옮기다 한 글자만 틀려도
조용히 깨지고, 실기기에서 보기 전까지 아무도 모릅니다.

검사하는 불변식:

1. `ink` · `inkMuted` · `inkFaint` · `inkHint` 가 `bg` 와 `surface` **양쪽 모두** 에서 4.5:1
2. `surface` 대 `bg` 가 1.25:1 — 카드가 그림자 없이도 층으로 읽혀야 합니다
3. `deep` 대 `surface` 가 3:1 — 선택된 탭·내비 알약은 비텍스트 UI (WCAG SC 1.4.11)
4. 채움 위의 글자 (`onLime`/`lime`, `onDeep`/`deep`, `onDark`/`deep`, `kakaoInk`/`kakao`)
5. 상태 잉크 (`warnInk` · `dangerInk` · `infoInk` · `neutralInk`)
6. `surface` 위 텍스트 색 (`error` · `greenText` · `greenStrong`)
7. 아바타 6색 위의 이니셜

## 이식하면서 바뀐 것

| | 안드로이드 | RN |
|---|---|---|
| 이름 | `gachi_ink_muted` | `ink.muted` → `light.inkMuted` |
| 테마 | `values-night/` 리소스 한정자 | `light` · `dark` 두 객체, `useColorScheme()` 으로 선택 |
| 알파 색 | `#D9FDFDF3` (ARGB 8자리) | `rgba(253, 253, 243, 0.85)` — RN 은 ARGB 를 이해하지 못합니다 |
| 글자 크기 | `sp` | 숫자. 시스템 배율은 `allowFontScaling` 이 담당합니다 |
| 행간 | 없음 (TextView 가 폰트 메트릭으로 처리) | `lineHeight` 신설 — RN Text 는 안 벌려줘서 한글이 답답해집니다 |
| 그림자 | `elevation` + `outlineSpotShadowColor` | `boxShadow` — 아래 참고 |

## 그림자와 안드로이드

기존 앱은 `outlineSpotShadowColor` 로 올리브 그림자를 쓰고 있습니다 (38곳).
검정 그림자는 연두 배경 위에서 채도가 빠진 회색때처럼 보이기 때문입니다.
그 결정을 그대로 이어받습니다.

RN 에서 색 있는 그림자를 내는 방법:

| | 색 | 오프셋·블러 | 안드로이드 |
|---|---|---|---|
| `boxShadow` | O | O | **API 28+** (New Architecture 전용) |
| `shadowColor` | O | iOS 만 | API 28+ |
| `elevation` | X (항상 검정) | X | 전 버전 |

**`boxShadow` 가 정본입니다.** 경계선인 API 28 은 `outlineSpotShadowColor` 의 경계와
**정확히 같습니다** — 지금도 API 24~27 에서는 색 없는 그림자를 보고 있다는 뜻이고,
RN 으로 옮겨도 그 사정은 나빠지지 않습니다.

조건: New Architecture 가 켜져 있어야 합니다 (RN 0.76+ 기본값, 0.80+ 는 사실상 유일).

### API 24~27 에서는 `boxShadow` 가 아무것도 그리지 않습니다

그래서 **층을 그림자에만 맡기지 마세요.** `surface` 와 `bg` 의 1.29:1 명도 차이와
`border` 1px 이 이미 층을 만들고 있고, 그림자는 그 위에 얹는 보강입니다.
위 불변식 2번이 이걸 강제합니다.

검정 그림자로라도 층을 세워야 하는 자리에서만 `androidElevation` 으로 분기하세요:

```tsx
import { Platform } from 'react-native';
import { shadow, androidElevation } from './tokens/elevation.ts';

const depth =
  Platform.OS === 'android' && Platform.Version < 28
    ? { elevation: androidElevation.card }
    : { boxShadow: shadow.light.card };
```

`boxShadow` 와 `elevation` 을 **함께 주면 그림자가 두 번 그려집니다.** 둘 중 하나만.

## 폰트

Pretendard (OFL — 앱 동봉 허용). `mobile/app/src/main/res/font/` 에 있습니다.

굵기는 `fontWeight` 가 아니라 패밀리 이름으로 고릅니다. 안드로이드 RN 은 `fontWeight` 로
굵기를 합성하지 못해서, 같은 코드가 iOS 에서만 굵어집니다. 파일 이름을 맞추세요:

```
assets/fonts/Pretendard-Regular.ttf
assets/fonts/Pretendard-Bold.ttf
```

`jua.ttf` 는 어디에서도 참조되지 않아 가져오지 않았습니다.

## 플랫폼 계약

컴포넌트가 예뻐도 이게 없으면 안드로이드 앱으로 성립하지 않습니다. 전부 `Screen` 과
`theme.tsx` 에 모여 있으니 화면마다 다시 정하지 마세요.

| | 어디서 | 기기 확인 |
|---|---|---|
| 안전 영역 (상태바 · 노치 · 제스처 바) | `Screen` → `SafeAreaView` | API 36 |
| 키보드 회피 | `Screen` → `KeyboardAvoidingView` (iOS padding, Android adjustResize) | API 36 · `mInputShown=true` 에서 필드 노출 |
| 터치 리플 | `useRipple()` — 모든 Pressable | API 36 · 길게 눌러 캡처 |
| 최소 터치 영역 48 | `size.minTouch` + `hitSlop` | API 36 · uiautomator 실측 48.0dp |
| 그림자 폴백 | `depth()` — API 27 이하는 elevation | **API 27 에뮬레이터** |
| 아이콘 접근성 | `Icon` 기본 숨김, `label` 로만 노출 | API 36 · uiautomator 글리프 0건 |
| 스크림이 시스템 바까지 | `Modal statusBarTranslucent` | — |

`Screen` 을 건너뛰고 화면을 직접 조립하지 마세요. 안전 영역과 키보드가 같이 빠집니다.

## 대비를 지키는 방법

`contrast.test.ts` 는 두 층을 봅니다:

1. **토큰끼리의 쌍** — 잉크 4단, 층 명도차, 채움 위 글자, 상태 색
2. **컴포넌트가 겹쳐 놓는 쌍** — Badge 가 `white` 를 `error` 위에 얹어 야간에 2.53:1 이
   된 적이 있습니다. 어느 토큰도 단독으로는 잘못되지 않아서 1번만으로는 못 잡습니다.

**컴포넌트가 토큰 두 개를 겹칠 때마다 2번에 한 줄을 추가하세요.** 이 규칙을 지키지
않으면 테스트가 통과해도 화면은 깨집니다.

`lime` 은 밝은 서피스 위에서 1.41:1 이라 선택 표시로 쓸 수 없습니다. 상태는 `deep`
채움이 집니다 — 원본 주석이 하단 내비에서 같은 결론에 도달했던 그 제약입니다.

## 아직 없는 것

화면 공통 적용 규칙:

- 핵심 정보·글자·48dp 터치 영역을 줄이지 않습니다. 캐릭터와 반복 설명부터 줄이고 부족하면 `Screen`의 세로 스크롤을 사용합니다. 프로필 소개는 2줄과 더 보기로 표시합니다.
- AI 확인과 빠른 줍기의 카테고리는 2열입니다. 수량은 48dp 이상의 −/+와 직접 숫자 입력을 함께 제공합니다. 공유 수량 부품의 구현·카탈로그 검증은 아직 필요합니다.
- 입력 오류는 `Field` 아래, 요청 실패는 입력을 유지하고 재시도하도록 표시합니다. 메뉴는 `BottomSheet`, 위험 행동 확인은 `Dialog`를 재사용합니다.
- 사진 선택은 OS 기본 선택기를 쓰며, 순서 변경에는 드래그와 앞·뒤 버튼을 함께 제공합니다.
- 캐릭터는 기존 새싹의 형태·팔레트를 유지합니다. 홈 5단계와 빈 상태 3종의 누락 그림은 제작 대상입니다. 단계 결정은 `../docs/feature-scope.md`를 따릅니다.

- 모션 토큰 — 지속시간·이징. 화면 전환을 붙일 때 정합니다
- 지도 마커 · 말풍선 — 화면 전용이라 그 화면을 만들 때 뽑습니다
- 아이콘 이름 대조표 — 기존 59개를 Material Design Icons 의 어느 이름으로 옮길지
- MaterialDesignIcons 폰트 1.3MB — 쓰는 아이콘만 남기려면 폰트를 벤더링해야 합니다
- 태블릿 실기기 확인 — `Screen` 의 최대 폭 제한은 코드로만 확인했습니다
- TalkBack 실사용 — 접근성 트리는 uiautomator 로 확인했지만 실제 읽어주는 순서는 못 봤습니다
- 실물 단말 — 지금까지 확인한 것은 에뮬레이터(API 36 · API 27)입니다

## 폰트

Pretendard 를 KS X 1001 완성형 영역 + 라틴 + 문장부호로 서브셋했습니다.

```
5.3MB → 1.8MB (66% 감소)
```

서브셋에 없는 희귀 음절은 두부가 아니라 **안드로이드 시스템 한글 폰트로 대체**됩니다 —
글꼴만 달라지고 글자는 보입니다. 닉네임처럼 사용자가 입력하는 자리에서 드물게 보일 수
있습니다.

다시 만들려면:

```bash
pyftsubset assets/fonts/Pretendard-Regular.ttf   --unicodes-file=tools/pretendard-subset-unicodes.txt   --output-file=assets/fonts/Pretendard-Regular.ttf   --layout-features='*' --name-IDs='*'
```

소스에 쓰인 한글이 전부 들어 있는지 확인하고 교체하세요.

## 화면 조합 레시피

화면 설계의 정본은 `../docs/screens/`이다. 아래 레시피는 화면이 그 문서를 구현할 때
재사용하는 배치 규칙이며, 기능·도메인 동작을 대신 정의하지 않는다.

| 레시피 | 소유 영역 | 조합 규칙 |
|---|---|---|
| Root tab | `Screen` 안전 영역과 `BottomNav` | 본문만 스크롤하고 하단 내비는 고정한다. 5개 목적지를 넘기면 가운데 항목을 `startAction`으로 표시한다. |
| Sub-screen | `Screen` + `AppHeader` | 헤더는 고정, 본문은 스크롤한다. 뒤로·제목·선택 액션은 `AppHeader` 슬롯에 넣는다. |
| Form | `AppHeader` + `Field` + `Button` | 필드 오류는 바로 아래, primary action은 문서가 정한 고정/스크롤 위치에 둔다. 키보드가 포커스 필드를 가리지 않게 한다. |
| List/detail | `List`/`ListRow`/`Card` | 목록 행의 좌·우 슬롯에 상태와 조작을 합성한다. 상세의 사진·지도·댓글은 기능 레이어가 소유한다. |
| Overlay | `BottomSheet` 또는 `Dialog` | 선택·보조 조작은 시트, 파괴적이거나 흐름을 멈추는 결정은 대화상자를 쓴다. |
| Metrics | `Card`/`Tile`/`Progress` | 수치 위계는 `Txt` 토큰으로, 차트·경로·활동 달력은 기능 레이어로 둔다. |

## UX 계약

- 모든 독립 조작은 48dp 이상의 터치 영역을 가진다. 작게 보이는 `Chip`은 hitSlop으로 이를 만족한다.
- 각 화면은 설계서의 로딩·빈·오류·오프라인·권한 거부·부분 실패 상태를 모두 구현한다. 공통 상태 표현은 `Loading`, `EmptyState`, `ErrorState`, `Banner`, `Snackbar`를 우선 사용한다.
- 제출 중에는 같은 요청을 다시 보내지 않도록 제출 조작을 잠그고, 실패한 폼 값은 보존한다.
- 필드 오류는 해당 필드 아래에 보이며, 서버 오류는 화면 설계서가 정한 `Banner` 또는 `Snackbar`로 보인다.
- 삭제·탈퇴·변경 버리기처럼 되돌리기 어려운 조작은 설계서에 정한 `Dialog` 확인을 거친다.
- 활동 달력·지도·경로·카메라·미디어·채팅 말풍선·홈의 캐릭터/그래프는 디자인 시스템 컴포넌트가 아니다. 토큰과 레시피만 공유하고 기능 화면에서 소유한다.

## 추가 공개 컴포넌트

- `IconButton`, `AppHeader`: 독립 아이콘 조작과 서브 화면 헤더. 요청 중에는 `backDisabled`로 뒤로가기를 비활성으로 알린다.
- `Switch`, `Checkbox`, `Field.endAdornment`, `NumberStepper`: 반복되는 폼 조작. 스테퍼는 직접 정수 입력과 0.3초 간격 길게 누르기를 제공한다.
- `BottomNav.startAction`, `Button`의 `deep`/`danger`/`ghostDanger`/`translucent`, `Chip`의 `deep`, `Avatar`의 `xl`(96dp)
