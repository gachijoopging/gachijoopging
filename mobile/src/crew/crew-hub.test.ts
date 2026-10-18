import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockGet = jest.fn();
const mockPush = jest.fn();
jest.mock('../api/config', () => ({ apiConfig: { real: false }, createApiClient: () => jest.requireMock('../api/client').createMockClient() }));
jest.mock('../api/client', () => ({ peek: () => undefined, forget: () => {}, ApiError: class extends Error {}, createMockClient: () => ({ get: (...args: unknown[]) => mockGet(...args), mutate: jest.fn() }) }));
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: true }) }));
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a), canGoBack: () => true, back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() }, useLocalSearchParams: () => ({}), useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('react-native', () => ({ View: 'View', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator', RefreshControl: 'RefreshControl', Share: { share: jest.fn(async () => ({})) } }));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, size: {}, tracking: {}, useTheme: () => ({ colors: {} }), useRipple: () => undefined },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));
import Hub from '../../app/crew/members';

const crew = (isLeader: boolean) => ({ data: { name: '한강줍깅크루', intro: '매주 토요일', goalCount: 300, photoUrl: null, memberCount: 2, isLeader, region: 'SEOUL', joinPolicy: 'APPROVAL', pendingJoinRequests: 1 } });
const members = { data: [{ id: 'u1', nickname: '관열', photoUrl: null, isLeader: true, totalItems: 10, joinedAt: '2026-09-01T00:00:00Z' }] };

let tree: ReactTestRenderer;
async function mount(isLeader: boolean) {
  mockGet.mockImplementation((key: string) => Promise.resolve(key === 'GET /crew' ? crew(isLeader) : key === 'GET /users/me' ? { data: { id: 'u1' } } : members));
  await act(async () => { tree = create(React.createElement(Hub)); });
}
const row = (title: string) => tree.root.findAll((n) => (n.type as unknown) === 'ListRow' && n.props.title === title)[0];
const texts = () => tree.root.findAll((n) => (n.type as unknown) === 'Txt').map((n) => n.props.children).flat().join('|');

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => mockPush.mockReset());
afterEach(() => act(() => tree.unmount()));

test('크루 정보와 크루원이 한 화면에 있다', async () => {
  await mount(false);
  expect(texts()).toContain('한강줍깅크루');
  expect(texts()).toContain('매주 토요일');
  expect(row('관열')).toBeDefined();
});

test('크루 카드에 활동 지역·가입 방식, 크루원 수에 정원이 보인다', async () => {
  await mount(false);
  expect(texts()).toContain('서울특별시');
  expect(tree.root.findAll((n) => (n.type as unknown) === 'Badge' && n.props.label === '비공개')).toHaveLength(1);
  expect(texts()).toContain('크루원 1/50명');
});

test('가입 신청 행은 크루장에게, 비공개 크루거나 대기 신청이 있을 때만 보인다', async () => {
  await mount(false);
  expect(row('가입 신청')).toBeUndefined();
  act(() => tree.unmount());
  await mount(true);
  expect(row('가입 신청')).toBeDefined();
});

test('크루장만 신고 처리로 갈 수 있다', async () => {
  await mount(false);
  expect(row('신고 처리')).toBeUndefined();
  act(() => tree.unmount());
  await mount(true);
  act(() => row('신고 처리').props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/crew/reports');
});
