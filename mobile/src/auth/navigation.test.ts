import { finishOnboarding } from './navigation';

jest.mock('expo-router', () => ({ router: { dismissAll: jest.fn(), replace: jest.fn() } }));

test('승인·생성 완료 후 뒤로 가기로 이전 온보딩에 돌아가지 않는다', () => {
  const navigation = { reset: jest.fn() };
  finishOnboarding(navigation, '/(tabs)');
  expect(navigation.reset).toHaveBeenCalledTimes(1);
  expect(navigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: '(tabs)' }] });
});
