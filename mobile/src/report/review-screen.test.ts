import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
const mockGet = jest.fn();
const mockMutate = jest.fn();
jest.mock('../api/client', () => ({ ApiError: class extends Error { code: string; constructor(mockCode: string) { super(mockCode); this.code = mockCode; } }, createMockClient: () => ({ get: (...args: unknown[]) => mockGet(...args), mutate: (...args: unknown[]) => mockMutate(...args) }) }));
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-router', () => ({ router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn() }, useLocalSearchParams: () => ({}), useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('react-native', () => ({ View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', Image: 'Image', Platform: { OS: 'android', select: (options: Record<string, unknown>) => options.android ?? options.default } }));
jest.mock('design-system/src', () => new Proxy({ space: { md: 16, sm: 8, xs: 4 }, size: { minTouch: 48 }, useRipple: () => undefined }, { get: (target, key) => key === 'Dialog' ? (props: any) => require('react').createElement('Dialog', props, props.children, props.actions) : key in target ? target[key as keyof typeof target] : String(key) }));
import Review from '../../app/crew/reports';
const MockApiError = require('../api/client').ApiError;
const me = { data: { id: 'leader', membership: { crew: { isLeader: true } } } };
const report = (id: string, targetType = 'POST', targetId = id) => ({ id, targetType, targetId, targetPreview: id, reporter: { nickname: 'reporter', photoUrl: null }, reason: 'SPAM', memo: null, createdAt: '2026-09-30T00:00:00Z' });
const deferred = () => { let resolve!: (value: unknown) => void; let reject!: (error: Error) => void; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let tree: ReactTestRenderer;
const rowIds = () => tree.root.findAll((node) => !!node.props.report && node.props.report.id).map((node) => node.props.report.id);
const scroll = () => tree.root.findByType('ScrollView' as never);
const bottom = { nativeEvent: { layoutMeasurement: { height: 600 }, contentOffset: { y: 600 }, contentSize: { height: 900 } } };
async function mount() { await act(async () => { tree = create(React.createElement(Review)); }); }
async function confirmAction(label: string) {
  act(() => tree.root.findAllByType('Pressable' as never)[0].props.onPress());
  act(() => tree.root.findAllByType('Button' as never).find((node) => node.props.label === label)!.props.onPress());
  await act(async () => { await tree.root.findByType('Dialog' as never).findAllByType('Button' as never)[1].props.onPress(); });
}
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mockGet.mockReset().mockImplementation((key: string) => Promise.resolve(key === 'GET /users/me' ? me : { data: { items: [report('first')], nextCursor: null } }));
  mockMutate.mockReset().mockResolvedValue({});
});
afterEach(() => { act(() => tree.unmount()); });

test('failed identity request gives a retryable error despite successful report response', async () => {
  mockGet.mockImplementation((key: string) => key === 'GET /users/me' ? Promise.reject(new Error('offline')) : Promise.resolve({ data: { items: [report('first')], nextCursor: null } }));
  await mount();
  expect(tree.root.findByType('ErrorState' as never).props.title).toBe('신고를 불러오지 못했어요');
  mockGet.mockImplementation((key: string) => Promise.resolve(key === 'GET /users/me' ? me : { data: { items: [report('first')], nextCursor: null } }));
  await act(async () => { await tree.root.findByType('ErrorState' as never).props.onRetry(); });
  expect(rowIds()).toEqual(['first']);
});

test('bottom scroll locks same-frame pagination and deduplicates overlapping pages', async () => {
  const tail = deferred();
  mockGet.mockImplementation((key: string, query?: { cursor?: string }) => key === 'GET /users/me' ? Promise.resolve(me) : query?.cursor ? tail.promise : Promise.resolve({ data: { items: [report('first')], nextCursor: 'next' } }));
  await mount();
  act(() => { scroll().props.onScroll(bottom); scroll().props.onScroll(bottom); });
  expect(mockGet.mock.calls.filter(([key, query]) => key === 'GET /crew/reports' && query?.cursor)).toHaveLength(1);
  await act(async () => { tail.resolve({ data: { items: [report('first'), report('second')], nextCursor: null } }); });
  expect(rowIds()).toEqual(['first', 'second']);
});

test('refresh begun before mutation cannot reinsert the resolved report', async () => {
  await mount();
  const old = deferred();
  mockGet.mockImplementation((key: string) => key === 'GET /users/me' ? Promise.resolve(me) : old.promise);
  let refresh!: Promise<void>;
  act(() => { refresh = scroll().props.refreshControl.props.onRefresh(); });
  await confirmAction('대상 삭제');
  expect(mockMutate).toHaveBeenCalledWith('POST /crew/reports/{reportId}', { reportId: 'first', result: 'DELETE' });
  expect(rowIds()).toEqual([]);
  await act(async () => { old.resolve({ data: { items: [report('first')], nextCursor: null } }); await refresh; });
  expect(rowIds()).toEqual([]);
});

test('failed dismissal retains the report and a server already-resolved response removes it', async () => {
  await mount();
  mockMutate.mockRejectedValueOnce(new Error('offline'));
  await confirmAction('기각');
  expect(rowIds()).toEqual(['first']);
  mockMutate.mockRejectedValueOnce(new MockApiError('NOT_FOUND'));
  act(() => tree.root.findAllByType('Button' as never).find((node) => node.props.label === '기각')!.props.onPress());
  await act(async () => { await tree.root.findByType('Dialog' as never).findAllByType('Button' as never)[1].props.onPress(); });
  expect(rowIds()).toEqual([]);
});

test('user resolution calls the kick endpoint and re-fetches remaining reports', async () => {
  mockGet.mockImplementation((key: string) => Promise.resolve(key === 'GET /users/me' ? me : { data: { items: [report('user-report', 'USER', 'member')], nextCursor: null } }));
  await mount();
  mockGet.mockImplementation((key: string) => Promise.resolve(key === 'GET /users/me' ? me : { data: { items: [], nextCursor: null } }));
  await confirmAction('크루원 추방');
  expect(mockMutate).toHaveBeenCalledWith('DELETE /crew/members/{userId}', { userId: 'member' });
  expect(rowIds()).toEqual([]);
});
