import { categoryChips, seriesSummary, totalsLabel } from './records';

describe('크루 기록 카테고리 칩', () => {
  test('수량이 많은 순서로 한글 이름과 개수를 보인다', () => {
    expect(categoryChips({ PLASTIC: 310, CIGARETTE: 620, CAN: 190 })).toEqual([
      { label: '담배꽁초', count: 620 },
      { label: '플라스틱', count: 310 },
      { label: '캔', count: 190 },
    ]);
  });

  test('0개인 카테고리는 칩을 만들지 않는다', () => {
    expect(categoryChips({ GLASS: 0, PAPER: 3 })).toEqual([{ label: '종이', count: 3 }]);
  });
});

describe('일별 막대 요약', () => {
  test('막대 하나씩이 아니라 기간과 총 개수를 한 문장으로 읽는다', () => {
    expect(seriesSummary('WEEK', 1430)).toBe('이번 주, 총 1,430개');
    expect(seriesSummary('MONTH', 0)).toBe('이번 달, 총 0개');
    expect(seriesSummary('ALL', 52000)).toBe('전체 기간, 총 52,000개');
  });
});

describe('통계 지표 읽기', () => {
  test('네 지표를 한 문장으로 읽는다 — 거리는 킬로미터로 풀어 쓴다', () => {
    expect(totalsLabel({ items: 1430, distanceM: 128000, durationSec: 96000, activities: 62 })).toBe(
      '1,430개, 128.0킬로미터, 26시간 40분, 활동 62회',
    );
  });

  test('1km 미만은 미터로 읽는다', () => {
    expect(totalsLabel({ items: 3, distanceM: 820, durationSec: 2520, activities: 1 })).toBe(
      '3개, 820미터, 42분, 활동 1회',
    );
  });
});
