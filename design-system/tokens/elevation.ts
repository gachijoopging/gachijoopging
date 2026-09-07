/**
 * 그림자와 테두리.
 *
 * ── 안드로이드 사정 ────────────────────────────────────────────────
 *
 * 안드로이드 elevation 그림자는 기본이 검정이라 연두 배경 위에 얹히면 채도가 빠진
 * 회색때처럼 보입니다. 기존 앱은 이걸 `outlineSpotShadowColor` 로 해결해서
 * 올리브 계열 그림자를 쓰고 있었습니다 (38곳). 그 결정을 그대로 이어받습니다.
 *
 * RN 에서 같은 결과를 내는 방법은 `boxShadow` 하나입니다:
 *
 *   boxShadow        New Architecture 전용. 색·오프셋·블러 전부 지원.
 *                    아웃셋 Android 9(API 28)+, 인셋 Android 10+, iOS 전 버전.
 *   shadowColor      Android API 28+ / iOS. 색만 되고 offset·opacity·radius 는 iOS 전용.
 *   elevation        Android 전용. 색 지정 불가 — 항상 검정.
 *
 * 그래서 boxShadow 를 정본으로 씁니다. 경계선(API 28)은 기존 앱의
 * `outlineSpotShadowColor` 와 **정확히 같습니다** — 지금 API 24~27 에서도 색 없는
 * 그림자를 보고 있다는 뜻이고, RN 으로 옮겨도 그 사정은 달라지지 않습니다.
 *
 * API 24~27 (Android 7.0~8.1) 에서 boxShadow 는 아무것도 그리지 않습니다.
 * 층이 사라지면 안 되는 자리(카드, 바텀시트)는 그림자에만 기대지 마세요 —
 * surface 와 bg 의 1.29:1 명도 차이와 `border` 1px 이 이미 층을 만듭니다.
 * 그림자는 그 위에 얹는 보강이지 층 그 자체가 아닙니다.
 *
 * androidElevation 은 그 구형 기기에서 검정 그림자로라도 층을 세워야 할 때
 * `Platform.Version < 28` 로 분기해 쓰는 대체값입니다. boxShadow 와 **함께 주면
 * 그림자가 두 번 그려집니다** — 둘 중 하나만 쓰세요.
 */

export type ShadowLevel =
  | 'flat'
  | 'card'
  | 'raised'
  | 'floating'
  | 'overlay'
  | 'lime';

type ShadowSet = Record<ShadowLevel, string>;

export const shadow: { light: ShadowSet; dark: ShadowSet } = {
  light: {
    flat: 'none',
    /** 카드·타일. 가장 많이 쓰는 단계 */
    card: '0px 2px 8px rgba(101, 114, 28, 0.12)',
    /** 떠 있는 행·선택된 칩 */
    raised: '0px 4px 14px rgba(101, 114, 28, 0.16)',
    /** 하단 내비·FAB */
    floating: '0px 8px 22px rgba(101, 114, 28, 0.20)',
    /** 바텀시트·모달 */
    overlay: '0px 12px 32px rgba(101, 114, 28, 0.24)',
    /** 촬영 버튼 — 라임 채움 아래의 라임 글로우 */
    lime: '0px 6px 18px rgba(166, 190, 30, 0.45)',
  },
  dark: {
    // 어두운 배경에서는 올리브 그림자가 배경에 묻혀 층을 못 만듭니다.
    // 야간에는 검정으로 돌리고 불투명도를 올려 대신합니다.
    flat: 'none',
    card: '0px 2px 8px rgba(0, 0, 0, 0.40)',
    raised: '0px 4px 14px rgba(0, 0, 0, 0.48)',
    floating: '0px 8px 22px rgba(0, 0, 0, 0.55)',
    overlay: '0px 12px 32px rgba(0, 0, 0, 0.62)',
    lime: '0px 6px 18px rgba(94, 122, 24, 0.50)',
  },
};

/** Android 8.1 이하 대체값. boxShadow 와 함께 쓰지 마세요. */
export const androidElevation: Record<ShadowLevel, number> = {
  flat: 0,
  card: 3,
  raised: 8,
  floating: 12,
  overlay: 20,
  lime: 6,
};

/**
 * 테두리 두께.
 *
 * hairline 이 기본입니다. 카드·목록 행·콜아웃에 1 을 넘는 색 테두리를 두면
 * 그건 층이 아니라 장식이 됩니다. focus 는 키보드·접근성 포커스 링 전용입니다.
 */
export const borderWidth = {
  hairline: 1,
  focus: 2,
} as const;
