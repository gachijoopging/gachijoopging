import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { usePaged } from './ProfileParts';
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('react-native', () => ({ Image: 'Image', Pressable: 'Pressable', View: 'View', Platform: { OS: 'android', select: (options: Record<string, unknown>) => options.android ?? options.default } }));
jest.mock('design-system/src', () => ({}));
type Page = { items: { id: string }[]; nextCursor: string | null };
const deferred = () => {
  let resolve!: (page: Page) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Page>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
let hook: ReturnType<typeof usePaged<{ id: string }>>;
function Probe({ fetcher, scope = 'a' }: { fetcher: (cursor: string | null) => Promise<Page>; scope?: string }) {
  hook = usePaged(fetcher, scope);
  return null;
}
let tree: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => { act(() => tree.unmount()); });
test('same-frame pagination sends once and reload discards its response', async () => {
  const tail = deferred();
  const fetcher = jest.fn().mockResolvedValueOnce({ items: [{ id: 'first' }], nextCursor: 'next' }).mockReturnValueOnce(tail.promise).mockResolvedValueOnce({ items: [{ id: 'fresh' }], nextCursor: null });
  act(() => { tree = create(React.createElement(Probe, { fetcher })); });
  await act(async () => { await hook.reload(); });
  let pending!: Promise<void>;
  act(() => { pending = hook.loadMore(); void hook.loadMore(); });
  expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => { await hook.reload(); });
  await act(async () => { tail.resolve({ items: [{ id: 'stale' }], nextCursor: 'old' }); await pending; });
  expect(hook.items).toEqual([{ id: 'fresh' }]);
  expect(hook.hasMore()).toBe(false);
  expect(hook.loadingMore).toBe(false);
});
test('changed member ignores a previous request error', async () => {
  const old = deferred();
  const fetcher = jest.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce({ items: [{ id: 'member-b' }], nextCursor: null });
  act(() => { tree = create(React.createElement(Probe, { fetcher })); });
  let pending!: Promise<boolean>;
  act(() => { pending = hook.reload(); });
  act(() => { tree.update(React.createElement(Probe, { fetcher, scope: 'b' })); });
  expect(hook.items).toBeNull();
  await act(async () => { await hook.reload(); });
  await act(async () => { old.reject(new Error('old member')); await pending; });
  expect(hook.items).toEqual([{ id: 'member-b' }]);
  expect(hook.failed).toBe(false);
});

