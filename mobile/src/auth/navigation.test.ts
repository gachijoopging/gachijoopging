import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROUTE_NAME, finishOnboarding } from './navigation';

jest.mock('expo-router', () => ({ router: { dismissAll: jest.fn(), replace: jest.fn() } }));

test('승인·생성 완료 후 뒤로 가기로 이전 온보딩에 돌아가지 않는다', () => {
  const navigation = { reset: jest.fn() };
  finishOnboarding(navigation, '/(tabs)');
  expect(navigation.reset).toHaveBeenCalledTimes(1);
  expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: '(tabs)' }] });
});

// reset 은 URL 을 해석하지 않는다. 그룹 폴더가 빠진 이름은 조용히 아무 데도 가지 않는다
test.each(Object.entries(ROUTE_NAME))('목적지 %s 의 reset 이름 %s 은 app/ 에 등록된 라우트다', (_, name) => {
  const base = resolve(__dirname, '../../app', name);
  expect([`${base}.tsx`, `${base}/index.tsx`, `${base}/_layout.tsx`].some((f) => existsSync(f))).toBe(true);
});
