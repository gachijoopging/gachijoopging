/**
 * 간격 토큰 (4 그리드). 안드로이드 `dimens.xml` 이식.
 *
 * 역할별로 세 단계씩만 둡니다. 2 단위로 흩어진 값은 눈으로 구분되지 않아
 * 위계를 전달하지 못합니다 — 그래서 스케일을 좁게 고정합니다.
 *
 *   요소 사이 간격   xs 4  붙어 있음 (제목 바로 아래 캡션)
 *                   sm 8  관련됨   (아이콘과 라벨, 나란한 칩)
 *                   md 12 분리됨   (카드와 카드, 섹션과 섹션)
 *
 *   컨테이너 여백    md 12 조밀한 컨테이너 (칩, 좁은 행)
 *                   lg 16 카드 안쪽
 *                   xl 20 화면 가장자리, 넓은 서피스
 *
 * 2xl·3xl 은 큰 섹션 구분용이라 사용처가 적습니다.
 */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
} as const;

/**
 * 화면 가장자리 여백. 값은 space.xl 과 같지만 조판 결정이라
 * 따로 바꿀 수 있게 이름을 유지합니다.
 */
export const screen = {
  horizontal: 20,
  top: 20,
  /** 하단 내비 회피용 스크롤 여백 */
  scrollBottomWithNav: 110,
  scrollBottom: 26,
} as const;

/** 컨트롤 치수 */
export const size = {
  /**
   * 최소 터치 영역. Material 3 은 48x48 과 요소 사이 8 을 요구합니다.
   * 보이는 크기가 이보다 작아도 되지만, **누를 수 있는 영역은 반드시 이 값 이상**이어야
   * 합니다 — 작게 보여야 하면 hitSlop 으로 영역만 넓히세요.
   */
  minTouch: 48,
  /** 최소 터치 영역. 보이는 원은 46 이고 2 는 인셋입니다 */
  iconButton: 48,
  avatarLg: 74,
  avatarXl: 96,
  avatarMd: 42,
  avatarSm: 30,
  bottomNavHeight: 68,
  captureFab: 76,
  /** 촬영 버튼을 배경에서 떼어내는 서피스 색 테두리 */
  captureRing: 6,
  /** 바텀시트 손잡이 */
  sheetHandleWidth: 44,
  sheetHandleHeight: 4,
  /** 라디오 표시. 바깥 원과 안쪽 점 */
  radio: 20,
  radioDot: 10,
} as const;

/**
 * 하단 내비 활성 알약의 인셋. 원본 `bg_nav_item_selected` 에서 가져왔습니다.
 *
 *   세로 8 — 알약이 바 높이를 꽉 채우지 않게 해서, 바의 알약형 모서리와 각진 사각형이
 *            충돌하며 양 끝 항목에 생기던 초승달 빈틈을 없앱니다.
 *   가로 6 — 인디케이터가 항목 폭보다 좁아야 Material 내비게이션 바의 활성 표시로
 *            읽힙니다.
 */
export const navIndicatorInset = { vertical: 8, horizontal: 6 } as const;

export type Space = keyof typeof space;
