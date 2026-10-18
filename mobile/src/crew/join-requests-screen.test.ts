import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
const mockGet = jest.fn();
const mockMutate = jest.fn();
jest.mock('../api/config', () => ({ apiConfig: { real: false }, createApiClient: () => jest.requireMock('../api/client').createMockClient() }));
jest.mock('../api/client', () => ({ ApiError: class extends Error { code: string; constructor(mockCode: string) { super(mockCode); this.code = mockCode; } }, createMockClient: () => ({ get: (...args: unknown[]) => mockGet(...args), mutate: (...args: unknown[]) => mockMutate(...args) }) }));
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-router', () => ({ router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn() }, useLocalSearchParams: () => ({}), useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('react-native', () => ({ View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', Image: 'Image', Platform: { OS: 'android', select: (options: Record<string, unknown>) => options.android ?? options.default } }));
jest.mock('design-system/src', () => new Proxy({ space: { md: 16, sm: 8, xs: 4 }, size: { minTouch: 48 }, useRipple: () => undefined }, { get: (target, key) => key === 'List' ? require('../test/mock-list').MockList : key === 'Dialog' ? (props: any) => require('react').createElement('Dialog', props, props.children, props.actions) : key in target ? target[key as keyof typeof target] : String(key) }));
import Review from '../../app/crew/join-requests';
const MockApiError = require('../api/client').ApiError;
const me = { data: { isLeader: true, pendingJoinRequests: 2 } };
const report = (id: string) => ({ id, user: { id, nickname: id, photoUrl: null }, createdAt: '2026-09-30T00:00:00Z' });
const deferred = () => { let resolve!: (value: unknown) => void; let reject!: (error: Error) => void; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let tree: ReactTestRenderer;
const rowIds = () => tree.root.findAll((node) => !!node.props.request && node.props.request.id).map((node) => node.props.request.id);
const list = () => tree.root.findByType('List' as never);
async function mount() { await act(async () => { tree = create(React.createElement(Review)); }); }
async function approve() {
  act(() => tree.root.findAllByType('Button' as never).find((node) => node.props.accessibilityLabel === 'first 님 가입 승인')!.props.onPress());
  await act(async () => { await tree.root.findByType('Dialog' as never).findAllByType('Button' as never)[1].props.onPress(); });
}
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mockGet.mockReset().mockImplementation((key: string) => Promise.resolve(key === 'GET /crew' ? me : { data: { items: [report('first')], nextCursor: null, total: 2 } }));
  mockMutate.mockReset().mockResolvedValue({});
});
afterEach(() => { act(() => tree.unmount()); });

test('failed identity request gives a retryable error despite successful report response', async () => {
  mockGet.mockImplementation((key: string) => key === 'GET /crew' ? Promise.reject(new Error('offline')) : Promise.resolve({ data: { items: [report('first')], nextCursor: null, total: 2 } }));
  await mount();
  expect(tree.root.findByType('ErrorState' as never).props.title).toBe('가입 신청을 불러오지 못했어요');
  mockGet.mockImplementation((key: string) => Promise.resolve(key === 'GET /crew' ? me : { data: { items: [report('first')], nextCursor: null, total: 2 } }));
  await act(async () => { await tree.root.findByType('ErrorState' as never).props.onRetry(); });
  expect(rowIds()).toEqual(['first']);
});

test('bottom scroll locks same-frame pagination and deduplicates overlapping pages', async () => {
  const tail = deferred();
  mockGet.mockImplementation((key: string, query?: { cursor?: string }) => key === 'GET /crew' ? Promise.resolve(me) : query?.cursor ? tail.promise : Promise.resolve({ data: { items: [report('first')], nextCursor: 'next', total: 2 } }));
  await mount();
  act(() => { list().props.onEndReached(); list().props.onEndReached(); });
  expect(mockGet.mock.calls.filter(([key, query]) => key === 'GET /crew/join-requests' && query?.cursor)).toHaveLength(1);
  await act(async () => { tail.resolve({ data: { items: [report('first'), report('second')], nextCursor: null, total: 2 } }); });
  expect(rowIds()).toEqual(['first', 'second']);
});


test('refresh response cannot restore a request approved during the fetch', async () => {
  await mount();
  const old = deferred();
  mockGet.mockImplementation((key: string) => key === 'GET /crew' ? Promise.resolve(me) : old.promise);
  let refresh!: Promise<void>;
  act(() => { refresh = list().props.refreshControl.props.onRefresh(); });
  await approve();
  expect(mockMutate).toHaveBeenCalledWith('POST /crew/join-requests/{requestId}', { requestId: 'first', decision: 'APPROVE' });
  expect(rowIds()).toEqual([]);
  await act(async () => { old.resolve({ data: { items: [report('first')], nextCursor: null, total: 2 } }); await refresh; });
  expect(rowIds()).toEqual([]);
});

test('after removing the only first-page row the next page stays reachable without scrolling', async () => {
  mockGet.mockImplementation((key: string, query?: { cursor?: string }) => Promise.resolve(key === 'GET /crew' ? me : { data: { items: [report(query?.cursor ? 'second' : 'first')], nextCursor: query?.cursor ? null : 'next' } }));
  await mount();
  await approve();
  expect(rowIds()).toEqual([]);
  await act(async () => { await tree.root.findAllByType('Button' as never).find((node) => node.props.label === '더 불러오기')!.props.onPress(); });
  expect(rowIds()).toEqual(['second']);
});
