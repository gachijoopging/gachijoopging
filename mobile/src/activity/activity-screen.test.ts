import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockHaptic = jest.fn(async (_type: string) => {});
const mockReplace = jest.fn();
let mockFocused = true;
let mockWriteFails = false;
const mockSession = { activityId: 'a1', userId: 'u1', startedAt: new Date().toISOString(), pausedSec: 0, paused: false, pausedAt: null, locationShared: false, itemCount: 0, byCategory: {}, segments: [], distanceM: 0, steps: null };
let mockStored: Record<string, unknown> = { session: mockSession, ended: null, outbox: [] };
const mockListeners = new Set<(s: Record<string, unknown>) => void>();
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'u' }));
jest.mock('expo-haptics', () => ({ performAndroidHapticsAsync: (t: string) => mockHaptic(t), AndroidHaptics: { Confirm: 'confirm' } }));
jest.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: () => {} }));
jest.mock('expo-linking', () => ({ openSettings: jest.fn() }));
jest.mock('expo-location', () => ({ getForegroundPermissionsAsync: async () => ({ granted: true }), hasServicesEnabledAsync: async () => true }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
jest.mock('expo-status-bar', () => ({ StatusBar: 'StatusBar' }));
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn() }, useLocalSearchParams: () => ({ id: 'a1' }), useIsFocused: () => mockFocused, useFocusEffect: () => {} }));
jest.mock('react-native', () => ({ View: 'View', Pressable: 'Pressable', AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../modules/kakao-map', () => ({ KakaoMapView: 'KakaoMapView' }));
const mockGet = jest.fn((_key: string): Promise<unknown> => new Promise(() => {}));
jest.mock('../api/client', () => ({ createMockClient: () => ({ get: (k: string) => mockGet(k) }) }));
jest.mock('./store', () => ({
  getStored: () => mockStored,
  loadAccount: () => mockStored,
  loadLastAccount: () => null,
  subscribe: (l: (s: typeof mockStored) => void) => { mockListeners.add(l); return () => mockListeners.delete(l); },
  updateStored: (fn: (s: typeof mockStored) => typeof mockStored) => {
    if (mockWriteFails) throw new Error('disk');
    const next = fn(mockStored);
    if (next === mockStored) return next;
    mockStored = next;
    mockListeners.forEach((l) => l(next));
    return next;
  },
}));
jest.mock('./tracking', () => ({ finalSteps: jest.fn(async () => {}), refreshSteps: jest.fn(async () => {}), startTracking: jest.fn(async () => {}), stopTracking: jest.fn(async () => {}), syncOutbox: jest.fn(async () => {}), tick: jest.fn() }));
jest.mock('./QuickPickupSheet', () => ({ QuickPickupSheet: 'QuickPickupSheet' }));
jest.mock('../profile/blocked-users', () => ({ useBlockedUsers: () => new Set() }));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, size: {}, radius: {}, depth: () => ({}), useTheme: () => ({ colors: {}, shadows: {} }), useReduceMotion: () => true, useRipple: () => undefined },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));
import Activity from '../../app/activity/[id]/index';

let tree: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => { act(() => tree.unmount()); mockFocused = true; mockWriteFails = false; mockStored = { session: mockSession, ended: null, outbox: [] }; mockReplace.mockClear(); mockGet.mockReset().mockImplementation(() => new Promise(() => {})); });

test('활동을 끝내 기록이 기기에 남으면 손끝으로 알리고 요약으로 간다', async () => {
  await act(async () => { tree = create(React.createElement(Activity)); });
  const dialog = tree.root.find((n) => (n.type as unknown) === 'Dialog' && n.props.title === '활동을 종료할까요?');
  const end = React.Children.toArray(dialog.props.actions.props.children).find((b) => (b as React.ReactElement<{ label: string }>).props.label === '종료하기') as React.ReactElement<{ onPress: () => Promise<void> }>;
  await act(async () => end.props.onPress());
  expect(mockHaptic).toHaveBeenCalledWith('confirm');
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/activity/[id]/summary', params: { id: 'a1' } });
  expect(mockReplace).toHaveBeenCalledTimes(1);
});

const pressEnd = async () => {
  const dialog = tree.root.find((n) => (n.type as unknown) === 'Dialog' && n.props.title === '활동을 종료할까요?');
  const end = React.Children.toArray(dialog.props.actions.props.children).find((b) => (b as React.ReactElement<{ label: string }>).props.label === '종료하기') as React.ReactElement<{ onPress: () => Promise<void> }>;
  await act(async () => end.props.onPress());
};

test.each([
  ['답하지 않아도', () => new Promise<void>(() => {})],
  ['저장에 실패해도', () => Promise.reject(new Error('disk'))],
])('종료 직전 걸음 읽기가 %s 종료하고, 끝까지 읽지 못한 걸음으로 거리를 줄이지 않는다', async (_label, read) => {
  const { finalSteps } = jest.requireMock('./tracking') as { finalSteps: jest.Mock };
  finalSteps.mockClear().mockImplementationOnce(read);
  mockStored = { session: { ...mockSession, steps: 100, distanceM: 1_000 }, ended: null, outbox: [] };
  await act(async () => { tree = create(React.createElement(Activity)); });
  await pressEnd();
  expect(finalSteps).toHaveBeenCalled();
  expect((mockStored.ended as { steps: number | null; distanceM: number })).toMatchObject({ steps: null, distanceM: 1_000 });
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/activity/[id]/summary', params: { id: 'a1' } });
});

test('종료 직전 걸음을 끝까지 읽었으면 그 값으로 기록한다', async () => {
  mockStored = { session: { ...mockSession, steps: 1_000, distanceM: 1_000 }, ended: null, outbox: [] };
  await act(async () => { tree = create(React.createElement(Activity)); });
  await pressEnd();
  expect((mockStored.ended as { steps: number | null })).toMatchObject({ steps: 1_000 });
});

test('종료하면 기기에 남는 경로도 종료 기록과 같다 — 요약 지도가 닫힌 경로를 그린다', async () => {
  const here = { latitude: 37.00009, longitude: 127, accuracy: 1 };
  mockStored = { session: { ...mockSession, segments: [[{ latitude: 37, longitude: 127 }]], distanceM: 0, here }, ended: null, outbox: [] };
  await act(async () => { tree = create(React.createElement(Activity)); });
  await pressEnd();
  const { session, ended } = mockStored as { session: { segments: { latitude: number; longitude: number }[][] }; ended: { route: number[][] } };
  expect(ended.route).toHaveLength(2);
  expect(session.segments.flat().map((p) => [p.longitude, p.latitude])).toEqual(ended.route);
});

test('시작한 지 24시간이 지난 활동을 열면 그 시점으로 끝내고 요약으로 간다 — 앱이 꺼져 있던 동안 지난 경우', async () => {
  const startedAt = Date.now() - 25 * 3_600_000;
  mockStored = { session: { ...mockSession, startedAt: new Date(startedAt).toISOString() }, ended: null, outbox: [] };
  await act(async () => { tree = create(React.createElement(Activity)); });
  expect((mockStored.ended as { endedAt: string }).endedAt).toBe(new Date(startedAt + 24 * 3_600_000).toISOString());
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/activity/[id]/summary', params: { id: 'a1' } });
});

test('24시간 전이면 끝내지 않는다', async () => {
  await act(async () => { tree = create(React.createElement(Activity)); });
  expect(mockStored.ended).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();
});

describe('일시정지 버튼과 24시간 기한', () => {
  const STARTED = Date.parse('2026-10-07T10:00:00Z');
  const DEADLINE = STARTED + 24 * 3_600_000;

  test.each([
    ['기한 1ms 전', 1, DEADLINE - 1],
    ['기한 정각', 0, DEADLINE],
  ])('%s 에 일시정지를 누르면 pause op 가 %i개 큐에 들어간다 — 종료보다 먼저 동기화되지 않게', async (_label, count, at) => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(at);
    mockFocused = false;
    mockStored = { session: { ...mockSession, startedAt: new Date(STARTED).toISOString() }, ended: null, outbox: [] };
    try {
      await act(async () => { tree = create(React.createElement(Activity)); });
      const button = tree.root.find((n) => typeof n.type === 'function' && n.props.accessibilityLabel === '일시정지');
      await act(async () => button.props.onPress());
      expect((mockStored.outbox as { kind: string }[]).filter((op) => op.kind === 'pause')).toHaveLength(count);
    } finally {
      now.mockRestore();
    }
  });
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

describe('24시간 자동 종료가 4-3 에서 막힐 때', () => {
  const expired = () => ({ session: { ...mockSession, startedAt: new Date(Date.now() - 25 * 3_600_000).toISOString() }, ended: null, outbox: [] });

  test('4-4·4-5 가 위에 있으면 요약으로 바꾸지 않는다 — 그 화면의 이탈 막기에 걸린다', async () => {
    mockStored = expired();
    mockFocused = false;
    await act(async () => { tree = create(React.createElement(Activity)); });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('저장에 실패하면 확인창이 오류와 [종료하기] 재시도를 보인다', async () => {
    mockStored = expired();
    mockWriteFails = true;
    await act(async () => { tree = create(React.createElement(Activity)); });
    const dialog = tree.root.find((n) => (n.type as unknown) === 'Dialog' && n.props.title === '활동을 종료할까요?');
    expect(dialog.props.visible).toBe(true);
    expect(dialog.findAll((n) => (n.type as unknown) === 'Banner')).toHaveLength(1);
    expect(mockReplace).not.toHaveBeenCalled();
    mockWriteFails = false;
    await pressEnd();
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/activity/[id]/summary', params: { id: 'a1' } });
  });

  test('저장에 실패해 활동이 남아 있어도 활동 시간은 24시간에서 멈춘다 — 다시 시도해 남는 기록과 같다', async () => {
    mockStored = expired();
    mockWriteFails = true;
    await act(async () => { tree = create(React.createElement(Activity)); });
    const metrics = tree.root.find((n) => (n.type as unknown) === 'MetricSplit');
    expect(metrics.props.items.find((m: { label: string }) => m.label === '활동 시간').value).toBe('24:00:00');
    expect(metrics.props.accessibilityLabel).toContain('활동 시간 24시간 0분');
  });

  describe('다른 주체가 종료 기록을 쓰면 — 루트 1분 검사·배경 위치 작업', () => {
    const summary = { pathname: '/activity/[id]/summary', params: { id: 'a1' } };
    const endElsewhere = () => act(async () => {
      mockStored = { ...mockStored, ended: { endedAt: new Date().toISOString(), durationSec: 0, pausedSec: 0, distanceM: 0, steps: null, route: [] } };
      mockListeners.forEach((l) => l(mockStored));
    });
    const refocus = () => act(async () => {
      mockFocused = true;
      tree.update(React.createElement(Activity));
    });

    test('4-3 이 포커스를 가진 동안이면 요약으로 간다', async () => {
      await act(async () => { tree = create(React.createElement(Activity)); });
      await endElsewhere();
      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith(summary);
    });

    test('저장 실패 확인창을 [계속 줍기]로 닫은 뒤 다른 주체가 저장해도 요약으로 간다', async () => {
      mockStored = expired();
      mockWriteFails = true;
      await act(async () => { tree = create(React.createElement(Activity)); });
      const dialog = tree.root.find((n) => (n.type as unknown) === 'Dialog' && n.props.title === '활동을 종료할까요?');
      const keep = React.Children.toArray(dialog.props.actions.props.children).find((b) => (b as React.ReactElement<{ label: string }>).props.label === '계속 줍기') as React.ReactElement<{ onPress: () => void }>;
      await act(async () => keep.props.onPress());
      mockWriteFails = false;
      await endElsewhere();
      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith(summary);
    });

    test('4-4·4-5 가 위에 있으면 이동하지 않고, 4-3 이 포커스를 되찾으면 한 번 이동한다', async () => {
      await act(async () => { tree = create(React.createElement(Activity)); });
      mockFocused = false;
      await act(async () => { tree.update(React.createElement(Activity)); });
      await endElsewhere();
      expect(mockReplace).not.toHaveBeenCalled();
      await refocus();
      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith(summary);
    });

    test('24시간이 지난 활동도 포커스를 되찾을 때 자동 종료와 겹쳐 두 번 이동하지 않는다', async () => {
      mockStored = expired();
      mockFocused = false;
      await act(async () => { tree = create(React.createElement(Activity)); });
      await endElsewhere();
      await refocus();
      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith(summary);
    });

    test('저장에 실패한 자동 종료는 매초 다시 시도하지 않는다', async () => {
      const { finalSteps } = jest.requireMock('./tracking') as { finalSteps: jest.Mock };
      finalSteps.mockClear();
      mockStored = expired();
      mockWriteFails = true;
      jest.useFakeTimers();
      try {
        await act(async () => { tree = create(React.createElement(Activity)); });
        expect(finalSteps).toHaveBeenCalledTimes(1);
        await act(async () => { jest.advanceTimersByTime(5_000); });
        expect(finalSteps).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

test('종료를 기다리는 사이 다른 계정의 활동이 열리면 그 활동을 끝내지 않고 요약으로 가지 않는다', async () => {
  const { finalSteps, stopTracking } = jest.requireMock('./tracking') as { finalSteps: jest.Mock; stopTracking: jest.Mock };
  stopTracking.mockClear();
  finalSteps.mockImplementationOnce(async () => {
    mockStored = { session: { ...mockSession, activityId: 'b1', userId: 'u2' }, ended: null, outbox: [] };
  });
  await act(async () => { tree = create(React.createElement(Activity)); });
  await pressEnd();
  expect(mockStored).toMatchObject({ ended: null, outbox: [] });
  expect(stopTracking).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  const dialog = tree.root.find((n) => (n.type as unknown) === 'Dialog' && n.props.title === '활동을 종료할까요?');
  const end = React.Children.toArray(dialog.props.actions.props.children).find((b) => (b as React.ReactElement<{ label: string }>).props.label === '종료하기') as React.ReactElement<{ loading: boolean }>;
  expect(end.props.loading).toBe(false);
});
