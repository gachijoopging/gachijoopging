import { formatDistance, formatElapsed } from './format';

describe('거리 표시', () => {
  test('1km 미만은 m 로', () => {
    expect(formatDistance(400)).toBe('400m');
  });

  test('1km 이상은 소수 1자리 km 로', () => {
    expect(formatDistance(1200)).toBe('1.2km');
    expect(formatDistance(1000)).toBe('1.0km');
  });
});

describe('경과 시간 표시', () => {
  test('1시간 미만은 분만', () => {
    expect(formatElapsed(900)).toBe('15분');
  });

  test('1시간 이상은 시간과 분', () => {
    expect(formatElapsed(4080)).toBe('1시간 8분');
  });
});
