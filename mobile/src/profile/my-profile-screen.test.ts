const mockGet = jest.fn();
const mockLeave = jest.fn();
jest.mock('../api/config', () => ({ apiConfig: { real: false }, createApiClient: () => jest.requireMock('../api/client').createMockClient() }));
jest.mock('../api/client', () => ({
  ApiError: class extends Error {
    code: string;
    constructor(value: string) { super(value); this.code = value; }
  },
  createMockClient: () => ({ get: (...args: unknown[]) => mockGet(...args), mutate: jest.fn() }),
}));
jest.mock('../feed/leave', () => ({ leaveForMembership: (...args: unknown[]) => mockLeave(...args) }));
jest.mock('./ProfileTabList', () => ({ ProfileTabList: ({ header }: { header: unknown }) => header }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', FlatList: 'FlatList', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', Image: 'Image',
  Platform: { OS: 'android', select: (options: Record<string, unknown>) => options.android ?? options.default },
}));
jest.mock('design-system/src', () => new Proxy({
  space: { sm: 8, md: 16, lg: 24, xs: 4 }, size: { minTouch: 48 }, radius: {},
  useRipple: () => undefined, useTheme: () => ({ colors: {} }), pressedOpacity: () => 1, characterEmpty: {},
}, { get: (target, key) => key in target ? target[key as keyof typeof target] : String(key) }));

const React = require('react');
const { act, create } = require('react-test-renderer');
const { ApiError } = jest.requireMock('../api/client');

const me = { id: 'u1', nickname: '관열', intro: '', photoUrl: null, membership: { status: 'MEMBER', crew: { name: '한강', isLeader: false } } };
let rendered: any;

beforeEach(() => {
  mockLeave.mockReset();
  mockGet.mockReset().mockImplementation((key: string) => {
    if (key === 'GET /users/me') return Promise.resolve({ data: me });
    if (key === 'GET /crew/members/{userId}/posts') return Promise.reject(new ApiError('NO_CREW'));
    return new Promise(() => {});
  });
});
afterEach(async () => { if (rendered) await act(async () => rendered.unmount()); rendered = null; });

test('추방·나가기 뒤 게시물 탭이 NO_CREW 면 소속 화면으로 보낸다 — 그곳의 내 활동 기록이 기록 전용 모드다', async () => {
  const { MyProfile } = require('./MyProfile');
  await act(async () => { rendered = create(React.createElement(MyProfile)); });
  await act(async () => rendered.root.findByType('Tabs').props.onChange('posts'));
  expect(mockGet).toHaveBeenCalledWith('GET /crew/members/{userId}/posts', { userId: 'u1', cursor: null });
  expect(mockLeave).toHaveBeenCalled();
});
