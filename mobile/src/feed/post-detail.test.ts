const mockGet = jest.fn();
const mockMutate = jest.fn();
const mockFiles = new Map<string, string>();
let mockBeforeRemove: ((event: { preventDefault: () => void }) => void) | null = null;
const mockNavigation = {
  addListener: (_event: string, listener: typeof mockBeforeRemove) => {
    mockBeforeRemove = listener;
    return () => { mockBeforeRemove = null; };
  },
};
jest.mock('../api/client', () => ({
  ApiError: class extends Error {},
  createMockClient: () => ({ get: (...args: unknown[]) => mockGet(...args), mutate: (...args: unknown[]) => mockMutate(...args) }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
  useLocalSearchParams: () => ({ id: 'p1' }),
  useNavigation: () => mockNavigation,
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'request-1' }));
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    private name: string;
    constructor(_directory: string, fileName: string) { this.name = fileName; }
    get exists() { return mockFiles.has(this.name); }
    textSync() { return mockFiles.get(this.name); }
    write(text: string) { mockFiles.set(this.name, text); }
  },
}));
jest.mock('react-native', () => ({
  View: 'View', Pressable: 'Pressable', FlatList: 'FlatList', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', Image: 'Image',
  Platform: { OS: 'android', select: (options: Record<string, unknown>) => options.android ?? options.default },
}));
jest.mock('design-system/src', () => new Proxy({
  space: { sm: 8, md: 16, lg: 24, xs: 4 }, size: { minTouch: 48 }, radius: {},
  useRipple: () => undefined, useTheme: () => ({ colors: {} }), pressedOpacity: () => 1,
}, { get: (target, key) => key in target ? target[key as keyof typeof target] : String(key) }));
jest.mock('../ui/useFlash', () => ({ useFlash: () => require('react').useState(null) }));
jest.mock('../notifications/notifications', () => ({ relativeTime: () => '방금' }));

const post = { id: 'p1', author: { id: 'u1', nickname: '나', photoUrl: null, withdrawn: false }, text: '게시물', visibility: 'CREW', media: [], likeCount: 0, liked: false, commentCount: 0, createdAt: '2026-10-01T00:00:00Z', comments: [] };
let account = 'u1';
let rendered: any;

beforeEach(() => {
  jest.resetModules();
  mockFiles.clear();
  account = 'u1';
  mockGet.mockReset().mockImplementation((key: string) => Promise.resolve({ data: key === 'GET /users/me'
    ? { id: account, membership: { status: 'MEMBER', crew: { isLeader: false } } }
    : key === 'GET /crew/posts' ? { items: [post], nextCursor: null } : post }));
  mockMutate.mockReset();
});
afterEach(async () => { await unmount(); });

async function mount(feed = false) {
  const React = require('react');
  const { act, create } = require('react-test-renderer');
  const Component = feed ? require('../../app/(tabs)/feed').default : require('../../app/5-2-post-detail').default;
  await act(async () => { rendered = create(React.createElement(Component)); });
}

async function unmount() {
  if (!rendered) return;
  const { act } = require('react-test-renderer');
  await act(async () => rendered.unmount());
  rendered = null;
}

test('댓글 초안은 계정과 게시물별로 복원한다', async () => {
  await mount();
  const { act } = require('react-test-renderer');
  await act(async () => rendered.root.findByType('Field').props.onChangeText('첫 계정의 초안'));
  await unmount();
  account = 'u2';
  await mount();
  expect(rendered.root.findByType('Field').props.value).toBe('');
  await unmount();
  account = 'u1';
  await mount();
  expect(rendered.root.findByType('Field').props.value).toBe('첫 계정의 초안');
});

test('계정을 확인하지 못하면 댓글 입력과 전송을 막는다', async () => {
  mockGet.mockImplementation((key: string) => key === 'GET /users/me' ? Promise.reject(new Error('offline')) : Promise.resolve({ data: post }));
  await mount();
  expect(rendered.root.findByType('Field').props.editable).toBe(false);
  expect(rendered.root.findAllByType('Button').find((button: any) => button.props.label === '등록').props.disabled).toBe(true);
});

test('댓글 응답 전에는 뒤로 이동을 막고 완료 후 해제한다', async () => {
  let finish!: (response: unknown) => void;
  mockMutate.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await mount();
  const { act } = require('react-test-renderer');
  await act(async () => rendered.root.findByType('Field').props.onChangeText('댓글'));
  await act(async () => { void rendered.root.findAllByType('Button').find((button: any) => button.props.label === '등록').props.onPress(); });
  const preventDefault = jest.fn();
  mockBeforeRemove!({ preventDefault });
  expect(preventDefault).toHaveBeenCalledTimes(1);
  await act(async () => finish({ data: { id: 'c1', author: post.author, text: '댓글', createdAt: post.createdAt } }));
  mockBeforeRemove!({ preventDefault });
  expect(preventDefault).toHaveBeenCalledTimes(1);
});

test('피드 탭은 모듈이 새로 로드돼도 기기 값으로 복원한다', async () => {
  await mount(true);
  const { act } = require('react-test-renderer');
  await act(async () => rendered.root.findByType('Tabs').props.onChange('MINE'));
  expect(mockFiles.get('feed-scope')).toBe('MINE');
  await unmount();
  jest.resetModules();
  await mount(true);
  expect(rendered.root.findByType('Tabs').props.value).toBe('MINE');
});

test('게시물 신고에 작성자와 본문 미리보기를 전달한다', async () => {
  account = 'u2';
  await mount();
  const { act } = require('react-test-renderer');
  const { router } = require('expo-router');
  await act(async () => rendered.root.findAllByType('Button').find((button: any) => button.props.label === '신고').props.onPress());
  expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ targetType: 'POST', targetId: 'p1', nickname: '나', text: '게시물' }) }));
});

test('댓글 신고에 선택한 댓글의 미리보기를 전달한다', async () => {
  account = 'u2';
  const comment = { id: 'c1', author: post.author, text: '신고할 댓글', createdAt: post.createdAt };
  mockGet.mockImplementation((key: string) => Promise.resolve({ data: key === 'GET /users/me' ? { id: account, membership: { status: 'MEMBER', crew: { isLeader: false } } } : { ...post, comments: [comment] } }));
  await mount();
  const { act } = require('react-test-renderer');
  const { router } = require('expo-router');
  await act(async () => rendered.root.findAllByType('Pressable').find((node: any) => node.props.onLongPress).props.onLongPress());
  await act(async () => rendered.root.findAllByType('Button').filter((button: any) => button.props.label === '신고').at(-1).props.onPress());
  expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ targetType: 'COMMENT', targetId: 'c1', nickname: '나', text: '신고할 댓글' }) }));
});
