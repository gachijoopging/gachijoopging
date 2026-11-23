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
  /** 원 배경 아이콘. 목록 행 · 요약 카드 · 활동 하단 바 */
  iconCircleSm: 32,
  iconCircleMd: 40,
  iconCircleLg: 48,
  bottomNavHeight: 68,
  /** 하단 내비 가운데 시작 버튼. 바 위로 `navActionLift` 만큼 솟아 다른 목적지와 구별됩니다 */
  navAction: 52,
  navActionLift: 18,
  /** 서브 화면 헤더 줄 높이 */
  appBar: 56,
  /** 체크박스 상자. 터치 영역은 행 전체라 minTouch 보다 작아도 됩니다 */
  checkbox: 24,
  /** 줄 안에 글자와 나란히 서는 상태 아이콘 (caption 옆) */
  iconInline: 16,
  /** 홈·빈 상태 캐릭터 그림 */
  character: 140,
  captureFab: 76,
  /** 촬영 버튼을 배경에서 떼어내는 서피스 색 테두리 */
  captureRing: 6,
  /** 바텀시트 손잡이 */
  sheetHandleWidth: 44,
  sheetHandleHeight: 4,
  /** 라디오 표시. 바깥 원과 안쪽 점 */
  radio: 20,
  radioDot: 10,
  /** 카드 머리에서 이름 옆에 서는 아이콘 (label 옆) */
  iconCard: 18,
  /** 정사각 사진 썸네일. sm 은 목록 행·미리보기 카드, md 는 사진 고르기 줄 */
  thumbSm: 40,
  thumbMd: 64,
  /** 세로로 긴 사진이 본문과 버튼을 밀어내지 않게 하는 상한 */
  photoMaxHeight: 520,
  /** 본문 안 지도 틀 (활동 요약·기록 상세·활동 중인 크루원) */
  mapFrame: 248,
  /** 촬영 프리뷰 틀. 큰 글자에서 먼저 줄어드는 자리라 하한만 둡니다 */
  captureFrameMin: 280,
  /** 촬영 틀 네 귀의 ㄱ자 가이드. 길이와 선 굵기 */
  cornerGuide: 26,
  cornerGuideStroke: 3,
  /** 공유 이미지 경로 선 굵기 */
  routeStroke: 4,
  /** 워드마크 폭. 홈 머리·로그인·시작 화면 순. 높이는 원본 비율(301/840)로 정한다 */
  wordmarkSm: 110,
  wordmarkMd: 190,
  wordmarkLg: 270,
  /** 시작 화면 워드마크 뒤 번짐 */
  wordmarkGlow: 220,
  /** 피드 카드 사진 높이 */
  feedPhoto: 190,
  /** 홈 최근 7일 막대 그래프 높이와 막대 폭 */
  sparkline: 32,
  sparklineBar: 6,
} as const;

/** 워드마크 원본 비율(세로/가로) */
export const WORDMARK_RATIO = 301 / 840;

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
