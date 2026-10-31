import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockNavigate = jest.fn();
const mockRouter = { replace: jest.fn(), navigate: (...a: unknown[]) => mockNavigate(...a) };
const mockEndIfExpired = jest.fn(async (): Promise<'ended' | 'saveFailed' | null> => null);
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }));
jest.mock('expo-router', () => ({
  Stack: Object.assign(() => null, { Screen: () => null }),
  useRootNavigationState: () => undefined,
  useRouter: () => mockRouter,
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('design-system/src', () => ({ ThemeProvider: ({ children }: { children: React.ReactNode }) => children, useReduceMotion: () => false }));
jest.mock('../api/config', () => ({ apiConfig: { real: false }, createApiClient: jest.fn() }));
jest.mock('../auth/launch', () => ({ launchDestination: jest.fn() }));
jest.mock('./actions', () => ({ endIfExpired: () => mockEndIfExpired() }));
jest.mock('./store', () => ({ loadLastAccount: () => ({ session: { activityId: 'a1' }, ended: null, outbox: [] }) }));
import RootLayout from '../../app/_layout';

let tree: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => { act(() => tree.unmount()); mockNavigate.mockClear(); mockEndIfExpired.mockReset().mockResolvedValue(null); jest.useRealTimers(); });

test.each([
  ['저장에 실패하면 4-3 을 열어 오류와 [종료하기] 재시도를 보인다', 'saveFailed', true],
  ['끝냈으면 화면을 옮기지 않는다', 'ended', false],
  ['기한 전이면 화면을 옮기지 않는다', null, false],
] as const)('4-3 밖에서 24시간 지난 활동을 확인할 때 %s', async (_label, result, opens) => {
  mockEndIfExpired.mockResolvedValue(result);
  await act(async () => { tree = create(React.createElement(RootLayout)); });
  if (opens) expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/activity/[id]', params: { id: 'a1' } });
  else expect(mockNavigate).not.toHaveBeenCalled();
});

test('앱이 앞에 있는 동안 1분마다 다시 검사한다 — 위치가 꺼져 배경 위치 작업이 깨지 않고 4-3 이 아닌 화면에 있어도', async () => {
  jest.useFakeTimers();
  await act(async () => { tree = create(React.createElement(RootLayout)); });
  expect(mockEndIfExpired).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(mockEndIfExpired).toHaveBeenCalledTimes(2);
});
