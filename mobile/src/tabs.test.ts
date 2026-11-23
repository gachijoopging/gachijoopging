import { TABS, tabValueOf } from './tabs';

describe('탭 구성', () => {
  test('가운데가 줍깅이라야 BottomNav 시작 버튼이 줍깅이 된다', () => {
    expect(TABS).toHaveLength(5);
    expect(TABS[2].value).toBe('plogging');
  });

  test('라우트 이름을 탭 값으로 읽는다', () => {
    expect(tabValueOf('feed')).toBe('feed');
    expect(tabValueOf('profile')).toBe('profile');
  });

  test('모르는 라우트는 홈으로 떨어진다', () => {
    expect(tabValueOf('does-not-exist')).toBe('index');
  });
});
