import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockHaptic = jest.fn(async (_type: string) => {});
const mockReplace = jest.fn();
const mockSession = { activityId: 'a1', userId: 'u1', startedAt: '2026-10-01T00:00:00Z', pausedSec: 0, paused: false, pausedAt: null, locationShared: false, itemCount: 0, byCategory: {}, segments: [], distanceM: 0, steps: null };
let mockStored: Record<string, unknown> = { session: mockSession, ended: null, outbox: [] };
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-haptics', () => ({ performAndroidHapticsAsync: (t: string) => mockHaptic(t), AndroidHaptics: { Confirm: 'confirm' } }));
jest.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: () => {} }));
jest.mock('expo-linking', () => ({ openSettings: jest.fn() }));
jest.mock('expo-location', () => ({ getForegroundPermissionsAsync: async () => ({ granted: true }), hasServicesEnabledAsync: async () => true }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
jest.mock('expo-status-bar', () => ({ StatusBar: 'StatusBar' }));
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn() }, useLocalSearchParams: () => ({ id: 'a1' }), useIsFocused: () => true, useFocusEffect: () => {} }));
jest.mock('react-native', () => ({ View: 'View', Pressable: 'Pressable', AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../modules/kakao-map', () => ({ KakaoMapView: 'KakaoMapView' }));
const mockGet = jest.fn((_key: string): Promise<unknown> => new Promise(() => {}));
jest.mock('../api/client', () => ({ createMockClient: () => ({ get: (k: string) => mockGet(k) }) }));
jest.mock('./store', () => ({
  getStored: () => mockStored,
  loadAccount: () => mockStored,
  loadLastAccount: () => null,
  subscribe: () => () => {},
  updateStored: (fn: (s: typeof mockStored) => typeof mockStored) => { mockStored = fn(mockStored); },
}));
jest.mock('./tracking', () => ({ refreshSteps: jest.fn(async () => {}), startTracking: jest.fn(async () => {}), stopTracking: jest.fn(async () => {}), syncOutbox: jest.fn(async () => {}), tick: jest.fn() }));
jest.mock('./QuickPickupSheet', () => ({ QuickPickupSheet: 'QuickPickupSheet' }));
jest.mock('../profile/blocked-users', () => ({ useBlockedUsers: () => new Set() }));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, size: {}, radius: {}, depth: () => ({}), useTheme: () => ({ colors: {}, shadows: {} }), useReduceMotion: () => true, useRipple: () => undefined },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));
import Activity from '../../app/activity/[id]/index';

let tree: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => { act(() => tree.unmount()); mockStored = { session: mockSession, ended: null, outbox: [] }; mockReplace.mockClear(); mockGet.mockReset().mockImplementation(() => new Promise(() => {})); });

test('활동을 끝내 기록이 기기에 남으면 손끝으로 알리고 요약으로 간다', async () => {
  await act(async () => { tree = create(React.createElement(Activity)); });
  const dialog = tree.root.find((n) => (n.type as unknown) === 'Dialog' && n.props.title === '활동을 종료할까요?');
  const end = React.Children.toArray(dialog.props.actions.props.children).find((b) => (b as React.ReactElement<{ label: string }>).props.label === '종료하기') as React.ReactElement<{ onPress: () => Promise<void> }>;
  await act(async () => end.props.onPress());
  expect(mockHaptic).toHaveBeenCalledWith('confirm');
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/activity/[id]/summary', params: { id: 'a1' } });
});

describe('기기에 없는 활동으로 들어왔을 때', () => {
  const enter = async (current: () => Promise<unknown>) => {
    mockStored = { session: null, ended: null, outbox: [] };
    mockGet.mockImplementation((key) => (key === 'GET /users/me' ? Promise.resolve({ data: { id: 'u1' } }) : current()));
    await act(async () => { tree = create(React.createElement(Activity)); });
  };
  test('서버가 다른 활동을 돌려주면 끝난 것으로 보고 4-1 로 돌아간다', async () => {
    await enter(() => Promise.resolve({ data: null }));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(tabs)/plogging', params: { flash: '활동이 이미 끝났어요' } });
  });
  test('조회 자체가 실패하면 끝났다고 하지 않는다', async () => {
    await enter(() => Promise.reject(new Error('network')));
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace.mock.calls[0][0].params.flash).not.toBe('활동이 이미 끝났어요');
    expect(mockReplace.mock.calls[0][0].params.flash).toMatch(/불러오지 못했어요/);
  });
});
