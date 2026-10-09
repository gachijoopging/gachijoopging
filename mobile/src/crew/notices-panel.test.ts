import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockGet = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string | undefined> = {};
jest.mock('../api/client', () => ({ peek: () => undefined, forget: () => {}, createMockClient: () => ({ get: (...args: unknown[]) => mockGet(...args) }) }));
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), setParams: (p: Record<string, undefined>) => { mockParams = { ...mockParams, ...p }; } },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]),
}));
jest.mock('react-native', () => ({ View: 'View', RefreshControl: 'RefreshControl' }));
jest.mock('./CalendarPanel', () => ({ CalendarPanel: 'CalendarPanel' }));
jest.mock('./RecordsPanel', () => ({ RecordsPanel: 'RecordsPanel' }));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, size: {}, borderWidth: {}, useTheme: () => ({ colors: {} }) },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));
import CrewTab from '../../app/(tabs)/crew';

const crew = (isLeader: boolean) => ({ data: { name: '한강줍깅크루', memberCount: 2, goalCount: 300, photoUrl: null, isLeader, unreadChat: 0, pinnedNotice: { id: 'n1', title: '9월 정기 활동 안내', createdAt: '2026-09-01T00:00:00Z' } } });
const notices = { data: { items: [{ id: 'n1', title: '9월 정기 활동 안내', preview: '여의도', commentCount: 2, pinned: true, createdAt: '2026-09-01T00:00:00Z' }, { id: 'n2', title: '8월 결산', preview: '수고했어요', commentCount: 0, pinned: false, createdAt: '2026-08-31T00:00:00Z' }], nextCursor: null } };

let tree: ReactTestRenderer;
async function mount(isLeader: boolean, params: Record<string, string | undefined> = {}) {
  mockParams = params;
  mockGet.mockImplementation((key: string) => Promise.resolve(key === 'GET /crew' ? crew(isLeader) : key === 'GET /crew/notices' ? notices : { data: { unreadNotifications: 0 } }));
  await act(async () => { tree = create(React.createElement(CrewTab)); });
}
const tabs = () => tree.root.findByType('Tabs' as never);
const titles = () => tree.root.findAll((n) => (n.type as unknown) === 'ListRow' || (n.type as unknown) === 'Txt').map((n) => n.props.title ?? n.props.children).flat();

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => mockPush.mockReset());
afterEach(() => act(() => tree.unmount()));

test('공지는 모이깅의 한 패널이다', async () => {
  await mount(false);
  expect(tabs().props.items.map((i: { value: string }) => i.value)).toContain('notices');
  await act(async () => tabs().props.onChange('notices'));
  expect(titles()).toEqual(expect.arrayContaining(['9월 정기 활동 안내', '8월 결산']));
});

test('공지 전체 보기는 화면을 옮기지 않고 공지 패널을 연다', async () => {
  await mount(false);
  const all = tree.root.find((n) => (n.type as unknown) === 'LinkText' && n.props.accessibilityLabel === '공지 전체 보기');
  await act(async () => all.props.onPress());
  expect(tabs().props.value).toBe('notices');
  expect(mockPush).not.toHaveBeenCalled();
});

test('공지를 쓰고 돌아오면 공지 패널로 연다', async () => {
  await mount(false, { tab: 'notices' });
  expect(tabs().props.value).toBe('notices');
});

test('크루장만 공지를 쓸 수 있다', async () => {
  await mount(false, { tab: 'notices' });
  const write = () => tree.root.findAll((n) => (n.type as unknown) === 'Button' && n.props.label === '공지 쓰기');
  expect(write()).toHaveLength(0);
  act(() => tree.unmount());
  await mount(true, { tab: 'notices' });
  act(() => write()[0].props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/crew/notices/edit');
});
