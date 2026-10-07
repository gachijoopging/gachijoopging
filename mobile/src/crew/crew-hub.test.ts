import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockGet = jest.fn();
const mockPush = jest.fn();
jest.mock('../api/client', () => ({ peek: () => undefined, ApiError: class extends Error {}, createMockClient: () => ({ get: (...args: unknown[]) => mockGet(...args), mutate: jest.fn() }) }));
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a), canGoBack: () => true, back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() }, useLocalSearchParams: () => ({}), useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('react-native', () => ({ View: 'View', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator', RefreshControl: 'RefreshControl', Share: { share: jest.fn(async () => ({})) } }));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, size: {}, tracking: {}, useTheme: () => ({ colors: {} }), useRipple: () => undefined },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));
import Hub from '../../app/crew/members';

const crew = (isLeader: boolean) => ({ data: { name: '한강줍깅크루', intro: '매주 토요일', goalCount: 300, photoUrl: null, memberCount: 2, isLeader, inviteCode: 'AB12CD', pendingJoinRequests: 1 } });
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

test('초대 코드는 화면을 옮기지 않고 시트로 연다', async () => {
  await mount(false);
  const sheet = () => tree.root.find((n) => (n.type as unknown) === 'BottomSheet' && n.props.title === '초대 코드');
  expect(sheet().props.visible).toBe(false);
  act(() => row('초대 코드').props.onPress());
  expect(sheet().props.visible).toBe(true);
  expect(mockPush).not.toHaveBeenCalled();
});

test('크루장만 신고 처리로 갈 수 있다', async () => {
  await mount(false);
  expect(row('신고 처리')).toBeUndefined();
  act(() => tree.unmount());
  await mount(true);
  act(() => row('신고 처리').props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/crew/reports');
});
