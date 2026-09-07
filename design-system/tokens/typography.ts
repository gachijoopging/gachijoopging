/**
 * 타이포 토큰. 안드로이드 `dimens.xml` · `type.xml` 이식.
 *
 * 크기 스케일은 프로토타입의 px 직역(0.5 단위)을 실사용 분포 기준 정수로 정리한 것입니다.
 * body 는 13 이었는데 레이아웃들이 이 토큰을 버리고 14·15·17 을 직접 박아 쓰고 있었습니다
 * (하드코딩 74건 중 54건이 이 셋). 토큰이 현실과 안 맞아 우회당한 경우라 body 를 14 로
 * 올리고 실제로 쓰이던 15·17 에 이름을 붙여 흡수했습니다.
 *
 * 12 는 가독성 하한입니다. label 과 micro 는 같은 크기이고 색·굵기로만 구분합니다.
 *
 * lineHeight 는 XML 에 없던 값이라 이식하면서 새로 정했습니다. 안드로이드 TextView 는
 * 폰트 메트릭으로 적당히 벌어지지만 RN Text 는 그렇지 않아, 한글 본문이 눈에 띄게
 * 답답해집니다. 본문 계열 ≈1.5, 제목 계열 ≈1.3, 큰 숫자 ≈1.1 로 잡았습니다.
 */
export const fontSize = {
  /** 활동 화면의 큰 카운터 숫자 */
  counter: 42,
  display: 26,
  title: 20,
  /** 수치 강조 */
  metric: 19,
  subtitle: 17,
  section: 16,
  bodyLg: 15,
  body: 14,
  /** 설명 텍스트 — 본문과 한 단계 차이 */
  caption: 13,
  /** 굵은 UI 라벨·배지 */
  label: 12,
  /** 힌트색 타임스탬프류 */
  micro: 12,
} as const;

export const lineHeight = {
  counter: 46,
  display: 34,
  title: 27,
  metric: 24,
  subtitle: 24,
  section: 22,
  bodyLg: 22,
  body: 21,
  caption: 19,
  label: 16,
  micro: 16,
} as const;

/**
 * Pretendard (OFL — 앱 동봉 허용).
 *
 * 굵기는 `fontWeight` 가 아니라 패밀리 이름으로 고릅니다. 안드로이드 RN 은
 * fontWeight 로 굵기를 합성하지 못해서, 같은 코드가 iOS 에서는 굵고
 * 안드로이드에서는 안 굵은 상태로 갈립니다. 파일 이름과 이 문자열을 일치시키세요:
 *   assets/fonts/Pretendard-Regular.ttf
 *   assets/fonts/Pretendard-Bold.ttf
 */
export const fontFamily = {
  /** 본문 */
  regular: 'Pretendard-Regular',
  /** 제목·숫자 강조 */
  bold: 'Pretendard-Bold',
} as const;

/**
 * 시스템 글자 크기 설정을 따를지 여부. 기본은 따르는 것이고, 끄지 마세요.
 *
 * 안드로이드는 배율 2.0 까지 허용합니다. 컨테이너를 minHeight/minWidth 로 두면
 * 그 배율에서도 자라므로 상한이 필요 없습니다.
 *
 * `maxFontSizeMultiplier` 는 정말 자랄 수 없는 자리 — 고정 높이 배지, 숫자만 들어가는
 * 원형 뱃지 — 에서만 개별로 넘기는 값입니다. 전역 기본값으로 두면 저시력 사용자의
 * 설정을 앱이 통째로 무시하게 됩니다.
 */
export const allowFontScaling = true;
export const fixedContainerFontScaleCap = 1.3;

export type FontSize = keyof typeof fontSize;
