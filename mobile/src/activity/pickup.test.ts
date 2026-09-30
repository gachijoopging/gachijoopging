import {
  aiBanner,
  applyPickup,
  byCategoryChips,
  groupDetections,
  itemsFromCounts,
  parseQuantity,
  summaryMeta,
  summaryDuration,
  totalOf,
  undoPickup,
} from './pickup';

describe('AI 탐지 묶기', () => {
  const detections = [
    { category: 'PLASTIC' as const, aiConfidence: 0.91 },
    { category: 'PLASTIC' as const, aiConfidence: 0.62 },
    { category: 'CAN' as const, aiConfidence: 0.88 },
  ];

  test('찾은 물체를 전부 카테고리별 수량으로 묶는다 — 최고 신뢰도 하나만 남기지 않는다', () => {
    const g = groupDetections(detections);
    expect(g.PLASTIC).toEqual({ count: 2, needsCheck: true, maxConfidence: 0.91 });
    expect(g.CAN).toEqual({ count: 1, needsCheck: false, maxConfidence: 0.88 });
    expect(g.GLASS).toBeUndefined();
  });

  test('0.7 미만이 하나라도 있으면 그 카테고리만 확인 필요', () => {
    expect(groupDetections([{ category: 'CAN', aiConfidence: 0.7 }]).CAN?.needsCheck).toBe(false);
    expect(groupDetections([{ category: 'CAN', aiConfidence: 0.69 }]).CAN?.needsCheck).toBe(true);
  });

  test('배너는 사용 불가 › 못 찾음 › 확인 필요 순서로 하나만', () => {
    expect(aiBanner(null)).toBe('unavailable');
    expect(aiBanner({ status: 'UNAVAILABLE', items: [] })).toBe('unavailable');
    expect(aiBanner({ status: 'OK', items: [] })).toBe('none');
    expect(aiBanner({ status: 'OK', items: detections })).toBe('check');
    expect(aiBanner({ status: 'OK', items: [detections[0]] })).toBeNull();
  });

  test('담을 줍기는 1개 이상인 칸만, AI 칸이면 예측 카테고리와 가장 높은 신뢰도를 붙인다', () => {
    let n = 0;
    const items = itemsFromCounts({ PLASTIC: 2, CAN: 0, GLASS: 1 }, groupDetections(detections), () => `id${++n}`);
    expect(items).toEqual([
      { id: 'id1', category: 'PLASTIC', quantity: 2, aiPredictedCategory: 'PLASTIC', aiConfidence: 0.91 },
      { id: 'id2', category: 'GLASS', quantity: 1 },
    ]);
  });
});

describe('수량 직접 입력', () => {
  test('0 이상의 정수만, 계약 상한 999 까지', () => {
    expect(parseQuantity('3')).toBe(3);
    expect(parseQuantity('0')).toBe(0);
    expect(parseQuantity('999')).toBe(999);
    expect(parseQuantity('1000')).toBeNull();
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity('-1')).toBeNull();
    expect(parseQuantity('1.5')).toBeNull();
  });

  test('합계', () => {
    expect(totalOf({ CAN: 2, PAPER: 3 })).toBe(5);
  });
});

describe('기기 합계와 되돌리기', () => {
  const base = { itemCount: 3, byCategory: { CAN: 3 } };

  test('담으면 합계와 카테고리 수량이 바로 오른다', () => {
    const next = applyPickup(base, [{ category: 'CAN', quantity: 2 }, { category: 'PAPER', quantity: 1 }]);
    expect(next).toEqual({ itemCount: 6, byCategory: { CAN: 5, PAPER: 1 } });
  });

  test('되돌리면 빼고, 0 이 된 카테고리는 지운다', () => {
    const next = undoPickup({ itemCount: 4, byCategory: { CAN: 3, PAPER: 1 } }, { category: 'PAPER', quantity: 1 });
    expect(next).toEqual({ itemCount: 3, byCategory: { CAN: 3 } });
  });
});

describe('종료 요약', () => {
  test('메타 줄 — 일시정지 60초 이상, 걸음은 측정됐을 때만', () => {
    const meta = summaryMeta({ startedAt: '2026-09-07T00:02:00Z', endedAt: '2026-09-07T00:48:00Z', pausedSec: 240, steps: 4100 });
    expect(meta).toBe('9월 7일 (월) 09:02 – 09:48 · 일시정지 4분 · 4,100걸음');
    expect(summaryMeta({ startedAt: '2026-09-07T00:02:00Z', endedAt: '2026-09-07T00:48:00Z', pausedSec: 59, steps: null })).toBe('9월 7일 (월) 09:02 – 09:48');
  });

  test('카테고리 칩은 수량 내림차순, 같으면 카테고리 순서', () => {
    expect(byCategoryChips({ PAPER: 2, CIGARETTE: 14, VINYL: 2, CAN: 3 })).toEqual([
      { category: 'CIGARETTE', count: 14 },
      { category: 'CAN', count: 3 },
      { category: 'PAPER', count: 2 },
      { category: 'VINYL', count: 2 },
    ]);
  });
});

describe('요약 활동 시간', () => {
  test('60초 미만은 "1분 미만", 그 위는 분·시간', () => {
    expect(summaryDuration(0)).toBe('1분 미만');
    expect(summaryDuration(59)).toBe('1분 미만');
    expect(summaryDuration(2520)).toBe('42분');
    expect(summaryDuration(4320)).toBe('1시간 12분');
  });
});
