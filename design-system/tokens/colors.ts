/**
 * 색 토큰. 안드로이드 `res/values/colors.xml` · `values-night/colors.xml` 이식.
 *
 * 두 팔레트는 같은 올리브 색상환(H≈57~75°)을 유지하고 명도만 뒤집습니다.
 * 브랜드가 연두 단색 기반이라 색상까지 건드리면 다른 앱이 됩니다.
 *
 * 불변식 — `contrast.test.ts` 가 강제합니다:
 *   1. ink / inkMuted / inkFaint / inkHint 는 bg 와 surface **양쪽 모두** 에서 4.5:1 이상.
 *      이 "양쪽" 조건이 bg 를 얼마나 어둡게 내릴 수 있는지의 상한을 잡습니다.
 *   2. surface 대 bg 는 1.25:1 이상. 카드가 그림자 없이도 층으로 읽혀야 합니다.
 *   3. deep 대 surface 는 3:1 이상 (WCAG SC 1.4.11 — 선택된 탭·내비 알약은 비텍스트 UI).
 *
 * 값을 하나 바꾸면 다른 값이 따라 움직여야 하는 경우가 많습니다. 테스트를 먼저 돌리세요.
 */

export type Palette = {
  /** 화면 바탕 */
  bg: string;
  /** 카드·시트 등 올라온 면 */
  surface: string;
  surface85: string;
  surface70: string;
  surface40: string;
  /** bg 의 60% — 본체 색이 바뀌면 함께 따라와야 합니다 */
  tint: string;

  camera: { bg: string; frame: string; scrim: string };

  white: string;

  ink: string;
  inkMuted: string;
  inkFaint: string;
  inkHint: string;
  ink65: string;
  /** deep 채움 위에 얹히는 글자 */
  onDark: string;
  /** 사진·스크림 위 밝은 글자 */
  onPhoto: string;
  inkShadow: string;

  /** 어두운 강조 채움 — 선택된 탭·칩·하단 내비 알약. 야간에는 밝은 쪽으로 반전됩니다 */
  deep: string;
  lime: string;
  lime35: string;
  lime28: string;
  yellow: string;
  /** deep 채움 위의 아이콘 */
  onDeep: string;
  /** 라임·노랑 채움 위의 글자. 라임은 야간에도 밝으므로 두 테마 모두 어둡습니다 */
  onLime: string;
  greenText: string;
  greenStrong: string;
  /** 활동 경로 선 — 지도 위에서 마커보다 뒤로 */
  route: string;

  kakao: string;
  kakaoInk: string;

  /** 그림자 색. 검정 그림자는 연두 배경 위에서 회색때처럼 보입니다 */
  shadow: string;
  shadowLime: string;
  shadowDeep: string;

  border: string;
  borderDashed: string;
  borderDotted: string;
  handle: string;
  track: string;

  neutral: string;
  neutralInk: string;
  softChip: string;

  warnBg: string;
  warnBgSoft: string;
  warnBorder: string;
  warnInk: string;
  dangerBg: string;
  dangerInk: string;
  /** 정보 상태 (H≈197°) — 배너·연동 배지 전용. 액션이나 장식에 쓰면 브랜드 밖 색이 튑니다 */
  infoBg: string;
  infoInk: string;
  error: string;
  /**
   * error 채움 위에 얹히는 글자.
   *
   * 라이트에서는 흰색이지만 야간에는 error 가 밝아져(#E8897C) 흰 글자가 2.53:1 로
   * 무너집니다. 그래서 색을 테마별로 나눠 둡니다 — `white` 를 직접 쓰지 마세요.
   */
  onError: string;
  /**
   * 악센트 (H≈33°). 팔레트의 나머지가 올리브 57~75° 안에 있어서 채도 대비가 생기는
   * 자리는 여기 하나뿐입니다. 그래서 역할을 좁게 고정합니다 —
   * "사용자 본인의 성취·달성 수치" 에만 씁니다.
   * 한 화면에 두 번 이상 필요하다고 느껴지면 색 문제가 아니라 위계 문제입니다.
   */
  orange: string;

  avatar: {
    me: string;
    pink: string;
    sky: string;
    sand: string;
    lilac: string;
    leaf: string;
  };

  black50: string;
  scrim: string;
  photoBadge: string;

  transparent: string;
};

export const light: Palette = {
  bg: '#DCE6A6',
  surface: '#FDFDF3',
  surface85: 'rgba(253, 253, 243, 0.85)',
  surface70: 'rgba(253, 253, 243, 0.70)',
  surface40: 'rgba(253, 253, 243, 0.40)',
  tint: 'rgba(220, 230, 166, 0.60)',

  camera: {
    bg: '#22260F',
    frame: '#1F2410',
    scrim: 'rgba(20, 24, 8, 0.28)',
  },

  white: '#FFFFFF',

  ink: '#262A0E',
  inkMuted: '#5C6142',
  inkFaint: '#5F6449',
  inkHint: '#5A5E42',
  ink65: 'rgba(38, 42, 14, 0.65)',
  onDark: '#F2F4DD',
  onPhoto: '#F4F7E6',
  inkShadow: 'rgba(30, 40, 10, 0.70)',

  deep: '#3D431F',
  lime: '#C9E345',
  lime35: 'rgba(201, 227, 69, 0.35)',
  lime28: 'rgba(201, 227, 69, 0.28)',
  yellow: '#F4F04B',
  onDeep: '#F4F04B',
  onLime: '#262A0E',
  greenText: '#5C6C14',
  greenStrong: '#4B6414',
  route: '#7FA018',

  kakao: '#FEE500',
  kakaoInk: '#3A1D1D',

  shadow: '#65721C',
  shadowLime: '#A6BE1E',
  shadowDeep: '#3D431F',

  border: '#DEE3BD',
  borderDashed: '#EDF0D6',
  borderDotted: '#C3CC93',
  handle: '#DDE3C2',
  track: '#EDF0D6',

  neutral: '#ECEEE4',
  neutralInk: '#5C6157',
  softChip: '#F2F5DD',

  warnBg: '#FFE9CD',
  warnBgSoft: '#FFF6EA',
  warnBorder: '#FFE0C2',
  warnInk: '#8C5316',
  dangerBg: '#FFD9D2',
  dangerInk: '#A5372A',
  infoBg: '#DBF3FD',
  infoInk: '#1F6C8C',
  error: '#C44343',
  onError: '#FFFFFF',
  orange: '#F09A3E',

  avatar: {
    me: '#E4F0C3',
    pink: '#FFD9E2',
    sky: '#DBF3FD',
    sand: '#FFE9CD',
    lilac: '#E9E4FD',
    leaf: '#E8EFC7',
  },

  black50: 'rgba(0, 0, 0, 0.50)',
  scrim: 'rgba(38, 42, 14, 0.45)',
  photoBadge: 'rgba(38, 42, 14, 0.72)',

  transparent: 'transparent',
};

export const dark: Palette = {
  bg: '#12160B',
  surface: '#262C18',
  surface85: 'rgba(38, 44, 24, 0.85)',
  surface70: 'rgba(38, 44, 24, 0.70)',
  surface40: 'rgba(38, 44, 24, 0.40)',
  tint: 'rgba(50, 58, 30, 0.60)',

  camera: {
    // 카메라 화면은 원래 어두워서 라이트와 같은 값을 유지합니다.
    bg: '#22260F',
    frame: '#1F2410',
    scrim: 'rgba(20, 24, 8, 0.28)',
  },

  white: '#FFFFFF',

  ink: '#EDF0DC',
  inkMuted: '#B4BA9C',
  inkFaint: '#A7AD8F',
  inkHint: '#9AA083',
  ink65: 'rgba(237, 240, 220, 0.65)',
  onDark: '#16190F',
  onPhoto: '#F4F7E6',
  inkShadow: 'rgba(0, 0, 0, 0.70)',

  // 라이트의 deep 값을 그대로 쓰면 어두운 서피스와 1.57:1 뿐이라, 야간에는 딥을
  // 밝은 쪽으로 보내고 그 위 글자(onDark·onDeep)를 어둡게 뒤집어 쌍으로 반전시킵니다.
  deep: '#7FA018',
  lime: '#C9E345',
  lime35: 'rgba(201, 227, 69, 0.35)',
  lime28: 'rgba(201, 227, 69, 0.28)',
  yellow: '#F4F04B',
  onDeep: '#16190F',
  onLime: '#262A0E',
  greenText: '#B7D64A',
  greenStrong: '#C6E356',
  route: '#9ABF22',

  kakao: '#FEE500',
  kakaoInk: '#3A1D1D',

  shadow: '#000000',
  shadowLime: '#5E7A18',
  shadowDeep: '#000000',

  border: '#3A4226',
  borderDashed: '#333A22',
  borderDotted: '#4A5330',
  handle: '#3A4226',
  track: '#333A22',

  neutral: '#2E3327',
  neutralInk: '#B0B4A6',
  softChip: '#2A3119',

  warnBg: '#3B2C13',
  warnBgSoft: '#2C2314',
  warnBorder: '#4C3A19',
  warnInk: '#F0BC76',
  dangerBg: '#40221D',
  dangerInk: '#F5A398',
  infoBg: '#16303B',
  infoInk: '#8AD2ED',
  error: '#E8897C',
  onError: '#2A100C',
  orange: '#F0A85A',

  avatar: {
    me: '#39441F',
    pink: '#462932',
    sky: '#1B3743',
    sand: '#43331C',
    lilac: '#332E4A',
    leaf: '#2E3A19',
  },

  black50: 'rgba(0, 0, 0, 0.50)',
  scrim: 'rgba(0, 0, 0, 0.65)',
  photoBadge: 'rgba(0, 0, 0, 0.77)',

  transparent: 'transparent',
};

export const palettes = { light, dark } as const;
export type ColorScheme = keyof typeof palettes;

/**
 * 주 채움 그라데이션 — 라임에서 노랑으로, 왼쪽에서 오른쪽 (원본 `android:angle="0"`).
 *
 * 기본 버튼 · 촬영 버튼 · 진행바가 전부 이걸 씁니다. 브랜드에서 "활성"을 뜻하는
 * 유일한 채움이라, 이걸 단색 라임으로 바꾸면 앱이 눈에 띄게 밋밋해집니다.
 * 라임과 노랑은 두 테마에서 값이 같으므로 팔레트 밖에 둡니다.
 */
export const gradient = {
  primary: {
    colors: ['#C9E345', '#F4F04B'] as const,
    start: { x: 0, y: 0.5 },
    end: { x: 1, y: 0.5 },
  },
} as const;
