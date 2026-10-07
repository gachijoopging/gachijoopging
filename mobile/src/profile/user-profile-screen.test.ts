const mockGet = jest.fn();
let mockPeeked: unknown;
jest.mock('../api/client', () => ({
  ApiError: class extends Error {},
  peek: (key: string) => (key === 'GET /crew/members/{userId}' ? mockPeeked : undefined),
  createMockClient: () => ({ get: (...args: unknown[]) => mockGet(...args), mutate: jest.fn() }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
  useLocalSearchParams: () => ({ id: 'u2' }),
}));
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class { get exists() { return false; } textSync() { return ''; } write() {} },
}));
jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', FlatList: 'FlatList', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', Image: 'Image',
  Platform: { OS: 'android', select: (options: Record<string, unknown>) => options.android ?? options.default },
}));
jest.mock('design-system/src', () => new Proxy({
  space: { sm: 8, md: 16, lg: 24, xs: 4 }, size: { minTouch: 48 }, radius: {},
  useRipple: () => undefined, useTheme: () => ({ colors: {} }), pressedOpacity: () => 1,
}, { get: (target, key) => key in target ? target[key as keyof typeof target] : String(key) }));

const React = require('react');
const { act, create } = require('react-test-renderer');

const profile = {
  id: 'u2', nickname: '지수', photoUrl: null, intro: null, joinedAt: '2026-09-01T00:00:00Z',
  isLeader: false, following: true, blocked: false, activeDays: [],
  stats: { activityCount: 1, itemCount: 2, distanceM: 300 },
};
let rendered: any;

beforeEach(() => {
  mockGet.mockReset().mockImplementation(() => new Promise(() => {}));
  mockPeeked = undefined;
});
afterEach(async () => { if (rendered) await act(async () => rendered.unmount()); rendered = null; });

async function mount() {
  const Screen = require('../../app/users/[id]').default;
  await act(async () => { rendered = create(React.createElement(Screen)); });
}

const profileLoading = () => rendered.root.findAll((n: any) => n.type === 'Loading' && n.props.label === '프로필을 불러오고 있어요');

test('전에 본 프로필이 있으면 받아 오는 동안에도 로딩 없이 그린다', async () => {
  mockPeeked = { data: profile };
  await mount();
  expect(profileLoading()).toHaveLength(0);
});

test('본 적 없는 프로필은 로딩부터 보인다', async () => {
  await mount();
  expect(profileLoading()).toHaveLength(1);
});
