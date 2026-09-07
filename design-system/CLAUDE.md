# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## 명령

```bash
npm start          # Expo 개발 서버 (기기·에뮬레이터)
npm run web        # 브라우저에서 Catalog
npm test           # node --test contrast.test.ts — 대비 불변식
npm run typecheck  # tsc --noEmit
npm run preview    # tokens/ 에서 preview.html 재생성 (생성물, git 무시)
```

단일 테스트: `node --test --test-name-pattern "<테스트 이름 일부>" contrast.test.ts`.
테스트 러너는 Node 내장이고 의존성이 없습니다 (Node 22.18+ 가 TS 를 직접 실행).
`npm run preview` 의 `MODULE_TYPELESS_PACKAGE_JSON` 경고는 의도된 것입니다 —
`"type": "module"` 을 넣으면 Expo 설정이 깨집니다.

## 구조

`tokens/` (순수 값, RN 의존 없음) → `src/theme.tsx` (팔레트 선택 + 플랫폼 분기)
→ `src/components/` (토큰을 직접 읽지 않고 `useTheme()` 을 통과).
공개 표면은 `src/index.ts` 하나뿐이고 `tokens/index.ts` 를 재수출합니다.
`App.tsx` → `src/Catalog.tsx` 는 전 컴포넌트를 늘어놓은 확인용 화면이지 배포 대상이
아닙니다. 임포트는 확장자를 붙입니다 (`allowImportingTsExtensions`).

이 패키지는 옛 모노레포(gachijupging)의 안드로이드 앱 `res/values{,-night}/` 토큰 이식본
입니다. 이식 판단 근거와 원본 대조표는 README.md 에 있습니다 — 값을 바꾸기 전에 읽으세요.

## 지켜야 하는 규칙

- **색을 바꿨으면 `npm test`.** 대비는 한 글자 틀려도 조용히 깨집니다.
- **컴포넌트가 토큰 두 개를 겹치면 `contrast.test.ts` 에 그 쌍을 한 줄 추가하세요.**
  토큰 단독으로는 멀쩡한데 겹쳐서 깨지는 경우를 1번 층(토큰 쌍)이 못 잡습니다.
- **그림자는 `depth(level, boxShadow)` 로만.** API 27 이하는 `boxShadow` 가 아무것도
  그리지 않아 `elevation` 으로 분기합니다. 둘을 함께 주면 두 번 그려집니다.
- **화면은 `Screen` 으로 감쌉니다.** 안전 영역 · 키보드 회피 · 최대 폭이 전부 거기
  모여 있습니다. `SafeAreaView` 를 직접 쓰면 규칙이 흩어집니다.
- **누르는 것에는 `useRipple()`.** 안드로이드는 리플, iOS 는 `pressedOpacity()`.
- **굵기는 `fontWeight` 가 아니라 폰트 패밀리 이름으로.** 안드로이드 RN 은 굵기를
  합성하지 못해 iOS 에서만 굵어집니다.
- **`lime` 은 밝은 서피스 위 1.41:1** 이라 선택 표시에 쓸 수 없습니다. `deep` 채움을 쓰세요.
- 색은 `rgba()` 로. RN 은 ARGB 8자리를 이해하지 못합니다.
