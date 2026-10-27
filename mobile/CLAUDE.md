# CLAUDE.md

이 파일은 `mobile/` 에서 일할 때의 Claude Code 지침이다.

@../AGENTS.md

## 명령

```bash
npm start              # Metro (개발 빌드용). Expo Go 로는 못 붙는다
npm run android        # 네이티브 빌드 + 설치 + 실행
npm run prebuild       # android/ 재생성 (--clean)
npm test               # Jest — 훅·유틸·상태
npm run typecheck      # tsc --noEmit
npm run gen:mocks      # docs/openapi.yaml 의 example → src/api/mocks.generated.ts
```

빌드 전에 `ANDROID_HOME` 이 있어야 한다. Windows 장경로와 ninja 1.12 설정은
`docs/conventions.md` §Windows — 둘 다 안 해두면 빌드가 260자 경로에서 죽는다.

## 구조

```
app/            expo-router. app/(tabs)/ 가 탭 5개, 파일 이름이 곧 URL — 아래 §라우트
src/api/        목 데이터 계층. 화면은 ApiClient 인터페이스만 본다
src/tabs.ts     탭 구성. 가운데(줍깅)가 BottomNav 의 시작 버튼 자리다
modules/        Expo Modules 로컬 네이티브 모듈 (배포하지 않는다)
plugins/        config plugin — android/ 가 재생성되어도 살아남아야 하는 네이티브 설정
android/        expo prebuild 산출물. 커밋하지 않고 직접 고치지도 않는다
```

**`android/` 를 손으로 고치지 않는다.** `prebuild --clean` 이 지운다. 네이티브 설정이 필요하면
`plugins/` 에 config plugin 을 만든다 (예: `with-kakao-maven.js`).

## 라우트

파일 이름은 URL 이다. 화면 번호(4-3)는 `docs/screens/` 문서 이름이고 코드에는 쓰지 않는다 —
`app/4-3-activity-in-progress.tsx` 가 아니라 `app/activity/[id]/index.tsx` 다.

- 그룹 `(auth)/`·`(onboarding)/`·`(tabs)/` 는 URL 에 안 나오고 묶기만 한다
- 자원은 폴더, 식별자는 `[id]`: `posts/[id]`·`users/[id]`·`records/[id]`·`crew/notices/[id]`
- 한 자원의 하위 화면은 그 폴더 안: `activity/[id]/{index,photo,review,summary}`
- `typedRoutes` 가 켜져 있어 `router.push` 의 pathname·params 가 라우트 파일과 어긋나면 `tsc` 가 잡는다.
  라우트 타입은 Metro 가 `.expo/types/` 에 만들고, 커밋하지 않는다

## design-system 임포트

`design-system/src` 에서 가져온다. `design-system` 만 쓰면 그 패키지의 `main` 인 카탈로그 앱
진입점(`registerRootComponent`)이 잡혀 앱이 두 번 등록된다.

```ts
import { Screen, Txt, useRipple } from 'design-system/src';
```

## 목 데이터

`src/api/mocks.generated.ts` 는 생성물이다. 고치지 말고 `docs/openapi.yaml` 의 해당 응답에
`example` 을 넣은 뒤 `npm run gen:mocks` 를 돌린다. 목에 없는 화면을 만들려면 계약에
`example` 을 먼저 채우는 순서다.

`src/api/contract.generated.ts` 도 같은 명령이 만드는 계약 타입이다. 실서버로 옮긴 경로는
`client.ts` 의 `ContractKey` 에 넣어 응답 타입을 목이 아니라 계약에서 가져온다. 그 경로의 응답
스키마에는 `required` 를 채운다 — 비어 있으면 모든 필드가 optional 로 생성된다.

화면에서 로딩·오류 UI 를 확인할 때는 목 클라이언트에 지연과 실패를 준다.

```ts
createMockClient({ delayMs: 300, failing: ['GET /crew/home'] })
```

## 비밀값

`mobile/.env` 는 앱 것이고 `infra/.env`(서버)와 다르다. 키 이름은 `docs/operations.md`.
값은 `app.config.js` 의 `extra` 를 거쳐 `expo-constants` 로 읽는다 — `app.json` 에 넣지 않는다.
그 파일은 커밋된다.

## 실측 위치 로그

걸으며 받은 GPS 원시 기록을 익명화해 `src/activity/__fixtures__/` 의 회귀 fixture 로 만든다.

1. `EXPO_PUBLIC_FIX_LOG=1` 로 릴리스 빌드를 설치한다
2. 앱이 외부 저장소에 파일을 새로 만들지 못하므로 먼저 만들어 둔다:
   `adb shell "mkdir -p /sdcard/Android/data/site.gachijoopging.app/files && touch /sdcard/Android/data/site.gachijoopging.app/files/fixlog.txt"`
3. 걷고 나서 `adb pull /sdcard/Android/data/site.gachijoopging.app/files/fixlog.txt walk.log`
4. `node scripts/fixlog-to-fixture.mjs walk.log src/activity/__fixtures__/walk.json` (Node 22.18+)

## 카카오맵

`modules/kakao-map/` 이 감싼다. **에뮬레이터에서는 확인할 수 없다** — SDK 가 arm 계열
`.so` 만 담고 있어 x86 에서는 `UnsatisfiedLinkError`, arm64 로 빌드하면 RN 이 못 뜬다.
실기기라야 한다.

콘솔에 등록할 키 해시는 APK 실제 서명에서 뽑는다 (`docs/operations.md`).
