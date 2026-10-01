import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
const mockGet = jest.fn();
const mockMutate = jest.fn();
jest.mock('../api/client', () => ({ createMockClient: () => ({ get: (...args: unknown[]) => mockGet(...args), mutate: (...args: unknown[]) => mockMutate(...args) }) }));
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]) }));
jest.mock('react-native', () => ({ View: 'View', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', Platform: { OS: 'android', select: (options: Record<string, unknown>) => options.android ?? options.default } }));
jest.mock('design-system/src', () => new Proxy({ space: { md: 16 } }, { get: (target, key) => key in target ? target[key as keyof typeof target] : String(key) }));
jest.mock('../auth/account', () => ({ currentAccount: () => ({ id: 'viewer', hasCrew: true }) }));
import Blocks from '../../app/settings/blocks';
const users = ['a', 'b', 'c'].map((id) => ({ id, nickname: id, photoUrl: null, withdrawn: false }));
const deferred = () => { let resolve!: (value?: unknown) => void; let reject!: (error: Error) => void; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let tree: ReactTestRenderer;
const names = () => tree.root.findAllByType('ListRow' as never).map((row) => row.props.title);
beforeEach(() => { jest.clearAllMocks(); mockGet.mockResolvedValue({ data: { items: users, total: 3, nextCursor: null } }); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => { act(() => tree.unmount()); });
test('same-frame unblocks both remove rows and failed requests restore their order', async () => {
  const first = deferred(); const second = deferred();
  mockMutate.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await act(async () => { tree = create(React.createElement(Blocks)); });
  const buttons = tree.root.findAllByType('Button' as never);
  act(() => { void buttons[0].props.onPress(); void buttons[1].props.onPress(); });
  expect(names()).toEqual(['c']);
  await act(async () => { second.reject(new Error('fail')); });
  await act(async () => { first.reject(new Error('fail')); });
  expect(names()).toEqual(['a', 'b', 'c']);
});
test('refresh does not restore a pending removal or duplicate its failed rollback', async () => {
  const pending = deferred(); mockMutate.mockReturnValue(pending.promise);
  await act(async () => { tree = create(React.createElement(Blocks)); });
  act(() => { void tree.root.findAllByType('Button' as never)[0].props.onPress(); });
  await act(async () => { await tree.root.findByType('ScrollView' as never).props.refreshControl.props.onRefresh(); });
  expect(names()).toEqual(['b', 'c']);
  await act(async () => { pending.reject(new Error('fail')); });
  expect(names()).toEqual(['a', 'b', 'c']);
});

test('pagination locks duplicate scrolls and keeps existing rows on failed tail fetch', async () => {
  const page = deferred();
  mockGet.mockResolvedValueOnce({ data: { items: [users[0]], total: 3, nextCursor: 'next' } }).mockReturnValueOnce(page.promise);
  await act(async () => { tree = create(React.createElement(Blocks)); });
  const bottom = { nativeEvent: { layoutMeasurement: { height: 600 }, contentOffset: { y: 600 }, contentSize: { height: 900 } } };
  act(() => { tree.root.findByType('ScrollView' as never).props.onScroll(bottom); tree.root.findByType('ScrollView' as never).props.onScroll(bottom); });
  expect(mockGet).toHaveBeenCalledTimes(2);
  await act(async () => { page.reject(new Error('offline')); });
  expect(names()).toEqual(['a']);
  mockGet.mockResolvedValue({ data: { items: users, total: 3, nextCursor: null } });
  await act(async () => { await tree.root.findAllByType('Button' as never).find((node) => node.props.label === '다시 시도')!.props.onPress(); });
  expect(names()).toEqual(['a', 'b', 'c']);
});

test('unblocking every loaded row leaves an accessible next-page button', async () => {
  mockGet.mockResolvedValueOnce({ data: { items: [users[0]], total: 2, nextCursor: 'next' } }).mockResolvedValueOnce({ data: { items: [users[1]], total: 1, nextCursor: null } });
  mockMutate.mockResolvedValue({});
  await act(async () => { tree = create(React.createElement(Blocks)); });
  await act(async () => { await tree.root.findAllByType('Button' as never).find((node) => node.props.label === '해제')!.props.onPress(); });
  expect(names()).toEqual([]);
  await act(async () => { await tree.root.findAllByType('Button' as never).find((node) => node.props.label === '더 불러오기')!.props.onPress(); });
  expect(names()).toEqual(['b']);
});
