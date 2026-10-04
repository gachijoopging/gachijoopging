import React from 'react';
import Summary from '../../app/activity/[id]/summary';

const { act, create } = require('react-test-renderer');
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, useLocalSearchParams: () => ({ id: 'a1' }), useNavigation: () => ({ addListener: () => () => {} }) }));
jest.mock('react-native', () => ({
  View: 'View',
  ScrollView: 'ScrollView',
  AccessibilityInfo: { setAccessibilityFocus: jest.fn() },
  findNodeHandle: () => null,
  Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android ?? o.default },
}));
jest.mock('../../modules/kakao-map', () => ({ KakaoMapView: 'KakaoMapView' }));
jest.mock('../api/client', () => ({ createMockClient: () => ({ get: jest.fn() }) }));
let mockStored: unknown = { session: null, ended: null, outbox: [] };
jest.mock('./store', () => ({
  getStored: () => mockStored,
  loadLastAccount: () => null,
  subscribe: () => () => {},
  updateStored: jest.fn(),
}));
jest.mock('./tracking', () => ({ applyEndedActivity: jest.fn(), syncOutbox: jest.fn(), activityGoneCode: () => null }));
jest.mock('../feed/leave', () => ({ leaveForMembership: jest.fn() }));
jest.mock('./ShareCard', () => ({ ShareCard: 'ShareCard', useShareImage: () => ({ capture: jest.fn() }) }));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, size: {}, radius: {}, useTheme: () => ({ colors: {} }), useReduceMotion: () => true },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });

test('기기에서 기록을 찾지 못해도 제목은 스크린리더가 제목으로 읽는다', async () => {
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(React.createElement(Summary)); });
  const title = tree.root.findAll((n: any) => n.type === 'Txt' && n.props.variant === 'title')[0];
  expect(title.props.accessibilityRole).toBe('header');
  act(() => tree.unmount());
});

test('저장이 끝난 기록의 지우기 버튼은 공유 카드 밖에 둔다', async () => {
  mockStored = {
    session: { activityId: 'a1', userId: 'u1', startedAt: '2026-09-30T00:00:00Z', pausedSec: 0, paused: false, pausedAt: null, locationShared: false, itemCount: 2, byCategory: {}, segments: [], distanceM: 120, steps: null },
    ended: { endedAt: '2026-09-30T00:30:00Z', durationSec: 1800, pausedSec: 0, distanceM: 120, steps: null, route: [] },
    outbox: [],
  };
  let tree!: ReturnType<typeof create>;
  await act(async () => { tree = create(React.createElement(Summary)); });
  const remove = tree.root.findAll((n: any) => n.type === 'Button' && n.props.label === '이 기록 지우기')[0];
  expect(remove).toBeDefined();
  let parent = remove.parent;
  while (parent && parent.type !== 'Card') parent = parent.parent;
  expect(parent).toBeNull();
  act(() => tree.unmount());
  mockStored = { session: null, ended: null, outbox: [] };
});
