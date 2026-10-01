import { categoryChips, changedItems, formatDuration, kstDateTime, metricsLabel, parseQuantity, routeToPath } from './activity-detail';

describe('경로 좌표', () => {
  test('계약의 [lng, lat] 를 지도의 위도·경도로 바꾼다', () => {
    expect(routeToPath([[126.93, 37.52]])).toEqual([{ latitude: 37.52, longitude: 126.93 }]);
  });

  test('경로가 없으면(null — 공유 끈 남의 활동) 빈 배열', () => {
    expect(routeToPath(null)).toEqual([]);
  });
});

describe('활동 시각', () => {
  test('KST 날짜와 오전·오후 시각', () => {
    expect(kstDateTime('2026-09-05T09:02:00Z')).toBe('2026년 9월 5일 오후 6:02');
    expect(kstDateTime('2026-09-04T15:30:00Z')).toBe('2026년 9월 5일 오전 12:30');
  });
});

describe('활동 시간', () => {
  test('1분 미만은 초로 보인다', () => {
    expect(formatDuration(0)).toBe('0초');
    expect(formatDuration(42)).toBe('42초');
  });

  test('1분 이상은 분·시간', () => {
    expect(formatDuration(2520)).toBe('42분');
    expect(formatDuration(4080)).toBe('1시간 8분');
  });
});

describe('지표 읽기', () => {
  test('걸음을 쟀으면 붙인다', () => {
    expect(metricsLabel({ itemCount: 27, durationSec: 2520, distanceM: 3120, steps: 4100 })).toBe(
      '줍기 27개, 활동 시간 42분, 이동 거리 3.1km, 4100걸음',
    );
  });

  test('미측정 걸음(null)은 읽지 않는다. 0걸음은 잰 값이라 읽는다', () => {
    expect(metricsLabel({ itemCount: 0, durationSec: 30, distanceM: 0, steps: null })).toBe(
      '줍기 0개, 활동 시간 30초, 이동 거리 0m',
    );
    expect(metricsLabel({ itemCount: 0, durationSec: 30, distanceM: 0, steps: 0 })).toContain('0걸음');
  });
});

describe('분류 요약 칩', () => {
  test('수량 있는 카테고리만, 카테고리 7종 순서로', () => {
    expect(categoryChips({ PLASTIC: 6, CIGARETTE: 14, GLASS: 0, VINYL: 2 })).toEqual(['담배꽁초 14', '플라스틱 6', '비닐 2']);
  });
});

describe('수량 입력', () => {
  test('1~999 정수만 받는다', () => {
    expect(parseQuantity('3')).toBe(3);
    expect(parseQuantity('999')).toBe(999);
    expect(parseQuantity('0')).toBeNull();
    expect(parseQuantity('1000')).toBeNull();
    expect(parseQuantity('2.5')).toBeNull();
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity('-1')).toBeNull();
  });
});

describe('바뀐 줍기 항목', () => {
  const original = [
    { id: 'a', category: 'PLASTIC' as const, quantity: 2 },
    { id: 'b', category: 'CIGARETTE' as const, quantity: 5 },
  ];

  test('카테고리나 수량이 달라진 것만 보낸다', () => {
    const edited = [
      { id: 'a', category: 'PLASTIC' as const, quantity: 2 },
      { id: 'b', category: 'CAN' as const, quantity: 5 },
    ];
    expect(changedItems(original, edited)).toEqual([{ id: 'b', category: 'CAN', quantity: 5 }]);
  });

  test('아무것도 안 바뀌면 빈 배열', () => {
    expect(changedItems(original, original)).toEqual([]);
  });

  test('이미 저장한 항목을 원본으로 삼으면 다시 보내지 않는다', () => {
    const edited = [
      { id: 'a', category: 'GLASS' as const, quantity: 1 },
      { id: 'b', category: 'CAN' as const, quantity: 5 },
    ];
    const savedA = [{ id: 'a', category: 'GLASS' as const, quantity: 1 }, original[1]];
    expect(changedItems(savedA, edited)).toEqual([{ id: 'b', category: 'CAN', quantity: 5 }]);
  });
});
