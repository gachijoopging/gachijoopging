import { monthDay } from './crew';

describe('공지 날짜 표시', () => {
  test('한국 시간 기준 월과 일만 보인다', () => {
    expect(monthDay('2026-09-01T09:00:00Z')).toBe('9월 1일');
  });

  test('UTC 로는 전날이어도 한국 시간으로 자정을 넘기면 다음 날이다', () => {
    expect(monthDay('2026-08-31T15:30:00Z')).toBe('9월 1일');
    expect(monthDay('2026-08-31T14:59:00Z')).toBe('8월 31일');
  });
});
