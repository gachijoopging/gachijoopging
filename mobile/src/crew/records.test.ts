import { categoryChips, chartSlots, seriesSummary, totalsLabel } from './records';

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

describe('기록 막대 칸', () => {
  test('이번 주는 월~일 7칸에 요일 자리를 지킨다. 지난 빈 날은 0, 아직 안 온 날은 빈칸', () => {
    // 2026-09-01 은 화요일
    const { values, labels } = chartSlots('WEEK', [
      { date: '2026-09-01', items: 40 },
      { date: '2026-09-02', items: 0 },
      { date: '2026-09-03', items: 77 },
    ], '2026-09-03');
    expect(values).toEqual([0, 40, 0, 77, null, null, null]);
    expect(labels).toEqual(['월', '화', '수', '목', '금', '토', '일']);
  });

  test('이번 달은 그 달 날수만큼 칸을 두고 1·8·15·22·29 일에만 이름을 단다', () => {
    const { values, labels } = chartSlots('MONTH', [{ date: '2026-09-02', items: 5 }], '2026-09-02');
    expect(values).toHaveLength(30);
    expect(values.slice(0, 3)).toEqual([0, 5, null]);
    expect(labels.filter(Boolean)).toEqual(['1', '8', '15', '22', '29']);
  });

  test('기록이 없어도 오늘을 기준으로 칸을 그린다', () => {
    expect(chartSlots('WEEK', [], '2026-09-29').values).toEqual([0, 0, null, null, null, null, null]);
  });

  test('전체 기간은 받은 달만큼 칸을 두고 달 이름을 단다', () => {
    const { values, labels } = chartSlots('ALL', [
      { date: '2026-08-01', items: 90 },
      { date: '2026-09-01', items: 30 },
    ], '2026-09-29');
    expect(values).toEqual([90, 30]);
    expect(labels).toEqual(['8월', '9월']);
  });
});
