import { light, dark } from 'design-system/src';
import { HEAT_OPACITY, canGoNextMonth, cellLabel, cellMark, daySummary, heatLevel, initialDate, isFutureDate, kstToday, monthGrid, shiftMonth } from './calendar';

const days = [
  { date: '2026-09-02', items: 12, activityCount: 1, activities: [] },
  { date: '2026-09-05', items: 47, activityCount: 2, activities: [] },
];

describe('월 격자', () => {
  test('일요일부터 시작해 앞뒤 달 칸까지 6주 42칸을 채운다', () => {
    const grid = monthGrid('2026-09', days);
    expect(grid).toHaveLength(42);
    expect(grid[0]).toMatchObject({ date: '2026-08-30', inMonth: false });
    expect(grid[2]).toMatchObject({ date: '2026-09-01', inMonth: true });
    expect(grid[41]).toMatchObject({ date: '2026-10-10', inMonth: false });
  });

  test('days 에 없는 날짜는 활동 0건으로 그린다', () => {
    const grid = monthGrid('2026-09', days);
    expect(grid.find((c) => c.date === '2026-09-05')).toMatchObject({ items: 47, activityCount: 2 });
    expect(grid.find((c) => c.date === '2026-09-03')).toMatchObject({ items: 0, activityCount: 0 });
  });

  test('2월·연말도 날짜가 이어진다', () => {
    expect(monthGrid('2026-02', [])[0].date).toBe('2026-02-01');
    expect(monthGrid('2026-12', []).map((c) => c.date)).toContain('2027-01-02');
  });
});

describe('날짜 칸 농도', () => {
  test('활동이 없으면 0단계다', () => {
    expect(heatLevel(0, 47)).toBe(0);
    expect(heatLevel(0, 0)).toBe(0);
  });

  test('그달 최대 줍기 수를 기준으로 1~3단계로 나눈다', () => {
    expect(heatLevel(47, 47)).toBe(3);
    expect(heatLevel(12, 47)).toBe(1);
    expect(heatLevel(24, 47)).toBe(2);
  });

  test('줍기 0개여도 활동이 있으면 옅게 칠한다', () => {
    expect(heatLevel(0, 47, 1)).toBe(1);
  });
});

describe('오늘과 월 이동', () => {
  test('오늘은 KST 날짜다 — UTC 9/5 15시는 KST 9/6', () => {
    expect(kstToday(new Date('2026-09-05T15:00:00Z'))).toBe('2026-09-06');
    expect(kstToday(new Date('2026-09-05T14:59:00Z'))).toBe('2026-09-05');
  });

  test('이전·다음 달은 해를 넘긴다', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  test('이번 달에서는 다음 달로 갈 수 없다', () => {
    expect(canGoNextMonth('2026-09', '2026-09-28')).toBe(false);
    expect(canGoNextMonth('2026-08', '2026-09-28')).toBe(true);
  });

  test('오늘 이후 날짜는 고를 수 없다', () => {
    expect(isFutureDate('2026-09-29', '2026-09-28')).toBe(true);
    expect(isFutureDate('2026-09-28', '2026-09-28')).toBe(false);
  });
});

describe('처음 고르는 날짜', () => {
  test('활동이 있는 날 중 오늘에 가장 가까운 날을 고른다', () => {
    expect(initialDate('2026-09', days, '2026-09-28')).toBe('2026-09-05');
    expect(initialDate('2026-09', days, '2026-09-03')).toBe('2026-09-02');
  });

  test('활동이 없으면 이번 달은 오늘, 지난 달은 1일을 고른다', () => {
    expect(initialDate('2026-09', [], '2026-09-28')).toBe('2026-09-28');
    expect(initialDate('2026-08', [], '2026-09-28')).toBe('2026-08-01');
  });

  test('활동 0건으로 온 날은 활동이 있는 날로 치지 않는다', () => {
    expect(initialDate('2026-09', [{ date: '2026-09-27', items: 0, activityCount: 0, activities: [] }], '2026-09-28')).toBe(
      '2026-09-28',
    );
  });
});

describe('날짜 문구', () => {
  test('선택 날짜 요약은 서버의 활동 건수·줍기 수를 그대로 쓴다', () => {
    expect(daySummary({ date: '2026-09-05', items: 47, activityCount: 2 })).toBe('9월 5일 · 활동 2건 · 47개');
  });

  test('날짜 칸은 활동 건수와 줍기 수를 읽고, 없거나 미래면 그렇게 읽는다', () => {
    expect(cellLabel({ date: '2026-09-05', items: 47, activityCount: 2 }, '2026-09-28')).toBe('9월 5일, 활동 2건, 47개');
    expect(cellLabel({ date: '2026-09-03', items: 0, activityCount: 0 }, '2026-09-28')).toBe('9월 3일, 활동 없음');
    expect(cellLabel({ date: '2026-09-29', items: 0, activityCount: 0 }, '2026-09-28')).toBe(
      '9월 29일, 활동 없음, 선택할 수 없음',
    );
  });
});

describe('날짜 칸 대비', () => {
  const rgb = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16));
  const lum = (c: number[]) =>
    c.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  test.each([['light', light], ['dark', dark]] as const)('%s: 모든 농도에서 숫자·점이 칸 위 4.5:1 이상이다', (_, c) => {
    for (const heat of [0, 1, 2, 3] as const) {
      const a = HEAT_OPACITY[heat];
      const cell = rgb(c.lime).map((v, i) => Math.round(v * a + rgb(c.surface)[i] * (1 - a)));
      expect(ratio(rgb(c[cellMark(heat, false)]), cell)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
