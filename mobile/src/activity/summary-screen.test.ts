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
jest.mock('./store', () => ({
  getStored: () => ({ session: null, ended: null, outbox: [] }),
  loadLastAccount: () => null,
  subscribe: () => () => {},
  updateStored: jest.fn(),
}));
jest.mock('./tracking', () => ({ applyEndedActivity: jest.fn(), syncOutbox: jest.fn() }));
jest.mock('./ShareCard', () => ({ ShareCard: 'ShareCard', useShareImage: () => ({ capture: jest.fn() }) }));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, size: {}, radius: {}, useTheme: () => ({ colors: {} }) },
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
