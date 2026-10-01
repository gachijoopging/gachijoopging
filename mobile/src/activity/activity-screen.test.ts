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
jest.mock('../api/client', () => ({ createMockClient: () => ({ get: () => new Promise(() => {}) }) }));
jest.mock('./store', () => ({
  getStored: () => mockStored,
  loadAccount: () => mockStored,
  loadLastAccount: () => null,
  subscribe: () => () => {},
  updateStored: (fn: (s: typeof mockStored) => typeof mockStored) => { mockStored = fn(mockStored); },
}));
jest.mock('./tracking', () => ({ startTracking: jest.fn(async () => {}), stopTracking: jest.fn(async () => {}), syncOutbox: jest.fn(async () => {}), tick: jest.fn() }));
jest.mock('./QuickPickupSheet', () => ({ QuickPickupSheet: 'QuickPickupSheet' }));
jest.mock('../profile/blocked-users', () => ({ useBlockedUsers: () => new Set() }));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, size: {}, radius: {}, depth: () => ({}), useTheme: () => ({ colors: {}, shadows: {} }), useReduceMotion: () => true, useRipple: () => undefined },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));
import Activity from '../../app/activity/[id]/index';

let tree: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => { act(() => tree.unmount()); mockStored = { session: mockSession, ended: null, outbox: [] }; });

test('활동을 끝내 기록이 기기에 남으면 손끝으로 알리고 요약으로 간다', async () => {
  await act(async () => { tree = create(React.createElement(Activity)); });
  const dialog = tree.root.find((n) => (n.type as unknown) === 'Dialog' && n.props.title === '활동을 종료할까요?');
  const end = React.Children.toArray(dialog.props.actions.props.children).find((b) => (b as React.ReactElement<{ label: string }>).props.label === '종료하기') as React.ReactElement<{ onPress: () => Promise<void> }>;
  await act(async () => end.props.onPress());
  expect(mockHaptic).toHaveBeenCalledWith('confirm');
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/activity/[id]/summary', params: { id: 'a1' } });
});
