import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
const mockFiles = new Map<string, string>();
const mockGet = jest.fn();
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-file-system', () => ({ Paths: { document: 'documents' }, File: class {
  name: string;
  constructor(_directory: string, name: string) { this.name = name; }
  get exists() { return mockFiles.has(this.name); }
  textSync() { return mockFiles.get(this.name); }
  write(value: string) { mockFiles.set(this.name, value); }
} }));
jest.mock('../api/client', () => ({ ApiError: class extends Error {}, createMockClient: () => ({ get: (...args: unknown[]) => mockGet(...args), mutate: jest.fn() }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() }, useFocusEffect: (fn: () => void) => require('react').useEffect(fn, [fn]), useLocalSearchParams: () => ({ id: 'post' }), useNavigation: () => ({ addListener: () => () => {} }) }));
jest.mock('react-native', () => new Proxy({ View: 'View', Pressable: 'Pressable', FlatList: 'FlatList', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', Image: 'Image', TextInput: 'TextInput' }, { get: (target, key) => key in target ? target[key as keyof typeof target] : jest.requireActual('react-native')[key] }));
jest.mock('design-system/src', () => new Proxy({ space: { sm: 8, md: 16, xs: 4 }, size: { minTouch: 48 }, radius: {}, useRipple: () => undefined, useTheme: () => ({ colors: {} }), pressedOpacity: () => 1 }, { get: (target, key) => key in target ? target[key as keyof typeof target] : String(key) }));
jest.mock('../ui/useFlash', () => ({ useFlash: () => require('react').useState(null) }));
jest.mock('../notifications/notifications', () => ({ relativeTime: () => '방금' }));
jest.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
jest.mock('../../modules/kakao-map', () => ({ KakaoMapView: 'KakaoMapView' }));
import { blockedUsers, reconcileBlockedUsers, setUserBlocked, useBlockedUsers } from './blocked-users';
import Feed from '../../app/(tabs)/feed';
import Detail from '../../app/posts/[id]';
import Live from '../../app/crew/live';
const user = (id: string) => ({ id, nickname: id, photoUrl: null, withdrawn: false });
const post = (id: string, author: string) => ({ id, author: user(author), text: id, visibility: 'CREW', media: [], likeCount: 0, liked: false, commentCount: 0, createdAt: '2026-09-30T00:00:00Z' });
const me = { data: { id: 'viewer', membership: { status: 'MEMBER', crew: { isLeader: false } } } };
let tree: ReactTestRenderer;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => { mockGet.mockReset(); setUserBlocked('viewer', 'target', false); });
afterEach(() => { if (tree) act(() => tree.unmount()); });

test('blocking immediately removes an already-loaded feed tail', async () => {
  mockGet.mockImplementation((key: string, query: { cursor?: string }) => Promise.resolve(key === 'GET /users/me' ? me : { data: query.cursor ? { items: [post('tail', 'target')], nextCursor: null } : { items: [post('first', 'other')], nextCursor: 'next' } }));
  await act(async () => { tree = create(React.createElement(Feed)); });
  await act(async () => { await tree.root.findByType('FlatList' as never).props.onEndReached(); });
  expect(tree.root.findByType('FlatList' as never).props.data.map((item: { id: string }) => item.id)).toEqual(['first', 'tail']);
  act(() => setUserBlocked('viewer', 'target', true));
  expect(tree.root.findByType('FlatList' as never).props.data.map((item: { id: string }) => item.id)).toEqual(['first']);
});

test('loaded comments disappear immediately and blocking the post author hides its body', async () => {
  mockGet.mockImplementation((key: string) => Promise.resolve(key === 'GET /users/me' ? me : { data: { ...post('post', 'other'), comments: [{ id: 'comment', author: user('target'), text: 'hidden-comment', createdAt: '2026-09-30T00:00:00Z' }] } }));
  await act(async () => { tree = create(React.createElement(Detail)); });
  expect(tree.root.findAllByType('Txt' as never).some((node) => node.props.children === 'hidden-comment')).toBe(true);
  act(() => setUserBlocked('viewer', 'target', true));
  expect(tree.root.findAllByType('Txt' as never).some((node) => node.props.children === 'hidden-comment')).toBe(false);
  act(() => setUserBlocked('viewer', 'other', true));
  expect(tree.root.findByType('EmptyState' as never).props.title).toBe('삭제된 게시물이에요');
  act(() => setUserBlocked('viewer', 'other', false));
});

test('loaded live member rows and location markers hide the blocked user', async () => {
  mockGet.mockImplementation((key: string) => Promise.resolve(key === 'GET /users/me' ? me : { data: [{ user: user('target'), activityId: 'a', location: { lat: 37, lng: 127 }, locationShared: true, paused: false, distanceM: 1, elapsedSec: 1, itemCount: 1 }] }));
  await act(async () => { tree = create(React.createElement(Live)); });
  expect(tree.root.findAllByType('ListRow' as never)).toHaveLength(1);
  act(() => setUserBlocked('viewer', 'target', true));
  expect(tree.root.findAllByType('ListRow' as never)).toHaveLength(0);
});

test('account isolation, persisted data, and stale server reconciliation', () => {
  const previous = blockedUsers('account-a');
  setUserBlocked('account-a', 'target', true);
  reconcileBlockedUsers('account-a', [], previous);
  expect(blockedUsers('account-a').has('target')).toBe(true);
  expect(blockedUsers('account-b').has('target')).toBe(false);
  expect(JSON.parse(mockFiles.get('blocked-users-account-a.json')!)).toEqual(['target']);
  mockFiles.set('blocked-users-cold.json', JSON.stringify(['target']));
  expect(blockedUsers('cold').has('target')).toBe(true);
});

test('subscribed chat-shaped cached items change immediately with account-specific blocks', () => {
  const items = [{ author: user('target') }, { author: user('other') }];
  let visible: typeof items = [];
  function CachedChat() { const blocked = useBlockedUsers('chat-viewer'); visible = items.filter((item) => !blocked.has(item.author.id)); return null; }
  act(() => { tree = create(React.createElement(CachedChat)); });
  act(() => setUserBlocked('chat-viewer', 'target', true));
  expect(visible.map((item) => item.author.id)).toEqual(['other']);
  act(() => setUserBlocked('different-viewer', 'other', true));
  expect(visible.map((item) => item.author.id)).toEqual(['other']);
});
