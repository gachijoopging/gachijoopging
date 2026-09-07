/** 모서리 반경. 안드로이드 `dimens.xml` 이식. */
export const radius = {
  /** 주 카드 */
  card: 26,
  /** 좁은 카드·목록 행 */
  cardSm: 22,
  /** 타일·작은 블록 */
  tile: 18,
  /** 입력창·선택 필드 */
  field: 16,
  /** 바텀시트 상단 */
  sheet: 30,
  /** 알약 — 칩·내비 알약. RN 은 999 로 충분합니다 */
  pill: 999,
} as const;

export type Radius = keyof typeof radius;
