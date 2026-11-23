import React from 'react';
import { ProfileTabList } from './ProfileTabList';

const { act, create } = require('react-test-renderer');
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('react-native', () => ({
  View: 'View',
  Image: 'Image',
  Pressable: 'Pressable',
  Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android ?? o.default },
}));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, radius: {}, size: {}, useTheme: () => ({ colors: {} }), useRipple: () => undefined, pressedOpacity: () => 1 },
  { get: (target, key) => (key === 'List' ? require('../test/mock-list').MockList : key in target ? target[key as keyof typeof target] : String(key)) },
));

type Paged<T> = { items: readonly T[] | null; failed: boolean; moreFailed: boolean; loadingMore: boolean; reload: () => void; loadMore: () => void };
const paged = <T,>(items: readonly T[] | null, extra: Partial<Paged<T>> = {}): Paged<T> => ({
  items, failed: false, moreFailed: false, loadingMore: false, reload: jest.fn(), loadMore: jest.fn(), ...extra,
});
const card = (id: string) => ({ id, startedAt: '2026-09-04T09:02:00Z', itemCount: 3, durationSec: 60, distanceM: 100, hasPhoto: false, byCategory: [] });
const post = (id: string) => ({ id, text: id, visibility: 'CREW', media: [] });

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
let tree: ReturnType<typeof create>;
afterEach(() => act(() => tree.unmount()));
const list = () => tree.root.findByType('List' as never);

function render(props: Partial<Parameters<typeof ProfileTabList>[0]>) {
  act(() => {
    tree = create(React.createElement(ProfileTabList, {
      tab: 'records',
      header: React.createElement('Header'),
      records: paged([card('r1')]) as never,
      posts: paged([]) as never,
      onOpenRecord: jest.fn(),
      onOpenPost: jest.fn(),
      ...props,
    } as never));
  });
}

test('목록 끝에 닿으면 지금 탭의 다음 장을 부른다', () => {
  const records = paged([card('r1')]);
  const posts = paged([post('p1')]);
  render({ records: records as never, posts: posts as never });
  list().props.onEndReached();
  expect(records.loadMore).toHaveBeenCalledTimes(1);
  expect(posts.loadMore).not.toHaveBeenCalled();
  act(() => tree.update(React.createElement(ProfileTabList, { tab: 'posts', header: null, records, posts, onOpenRecord: jest.fn(), onOpenPost: jest.fn() } as never)));
  list().props.onEndReached();
  expect(posts.loadMore).toHaveBeenCalledTimes(1);
});

test('다음 장을 받다 실패했으면 끝에 닿아도 다시 부르지 않고 다시 시도를 보인다', () => {
  const records = paged([card('r1')], { moreFailed: true });
  render({ records: records as never });
  list().props.onEndReached();
  expect(records.loadMore).not.toHaveBeenCalled();
  expect(tree.root.findAll((n: any) => n.type === 'LinkText' && n.props.label === '다시 시도')).toHaveLength(1);
});

test('게시물 탭은 세 칸 격자로, 기록 탭은 한 줄로 그린다', () => {
  render({ tab: 'posts', posts: paged([post('p1'), post('p2')]) as never });
  expect(list().props.numColumns).toBe(3);
  expect(tree.root.findAll((n: any) => n.props.accessibilityRole === 'button' && /^게시물/.test(n.props.accessibilityLabel ?? ''))).toHaveLength(2);
  act(() => tree.update(React.createElement(ProfileTabList, { tab: 'records', header: null, records: paged([card('r1')]), posts: paged([]), onOpenRecord: jest.fn(), onOpenPost: jest.fn() } as never)));
  expect(list().props.numColumns).toBe(1);
});

test('첫 장을 못 받으면 머리는 그대로 두고 그 탭의 다시 시도를 보인다', () => {
  const records = paged<ReturnType<typeof card>>(null, { failed: true });
  render({ records: records as never });
  expect(tree.root.findAllByType('Header' as never)).toHaveLength(1);
  const error = tree.root.findByType('ErrorState' as never);
  expect(error.props.title).toBe('활동 기록을 불러오지 못했어요');
  error.props.onRetry();
  expect(records.reload).toHaveBeenCalled();
});
