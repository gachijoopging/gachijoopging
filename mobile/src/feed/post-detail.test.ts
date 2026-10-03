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
  const Component = feed ? require('../../app/(tabs)/feed').default : require('../../app/posts/[id]').default;
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
  expect(rendered.root.findAllByType('Button').find((button: any) => button.props.label === '남기기').props.disabled).toBe(true);
});

test('댓글 응답 전에는 뒤로 이동을 막고 완료 후 해제한다', async () => {
  let finish!: (response: unknown) => void;
  mockMutate.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await mount();
  const { act } = require('react-test-renderer');
  await act(async () => rendered.root.findByType('Field').props.onChangeText('댓글'));
  await act(async () => { void rendered.root.findAllByType('Button').find((button: any) => button.props.label === '남기기').props.onPress(); });
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
  await act(async () => rendered.root.findAllByType('Button').find((button: any) => button.props.label === '신고하기').props.onPress());
  expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ targetType: 'POST', targetId: 'p1', nickname: '나', text: '게시물' }) }));
});

test('스크린리더 사용자도 댓글 관리 동작으로 메뉴를 연다', async () => {
  account = 'u2';
  const comment = { id: 'c1', author: post.author, text: '신고할 댓글', createdAt: post.createdAt };
  mockGet.mockImplementation((key: string) => Promise.resolve({ data: key === 'GET /users/me' ? { id: account, membership: { status: 'MEMBER', crew: { isLeader: false } } } : { ...post, comments: [comment] } }));
  await mount();
  const { act } = require('react-test-renderer');
  const row = rendered.root.findAllByType('Pressable').find((node: any) => node.props.onLongPress);
  expect(row.props.accessibilityActions).toEqual([{ name: 'longpress', label: '댓글 관리' }]);
  await act(async () => row.props.onAccessibilityAction({ nativeEvent: { actionName: 'longpress' } }));
  expect(rendered.root.findAllByType('Button').filter((button: any) => button.props.label === '신고하기').length).toBeGreaterThan(0);
});

test('댓글 신고에 선택한 댓글의 미리보기를 전달한다', async () => {
  account = 'u2';
  const comment = { id: 'c1', author: post.author, text: '신고할 댓글', createdAt: post.createdAt };
  mockGet.mockImplementation((key: string) => Promise.resolve({ data: key === 'GET /users/me' ? { id: account, membership: { status: 'MEMBER', crew: { isLeader: false } } } : { ...post, comments: [comment] } }));
  await mount();
  const { act } = require('react-test-renderer');
  const { router } = require('expo-router');
  await act(async () => rendered.root.findAllByType('Pressable').find((node: any) => node.props.onLongPress).props.onLongPress());
  await act(async () => rendered.root.findAllByType('Button').filter((button: any) => button.props.label === '신고하기').at(-1).props.onPress());
  expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ targetType: 'COMMENT', targetId: 'c1', nickname: '나', text: '신고할 댓글' }) }));
});

test('이전 댓글을 한 번 요청해 순서대로 앞에 붙이고 마지막 커서에서 버튼을 숨긴다', async () => {
  const recent = { id: 'recent', author: post.author, text: '최근 댓글', createdAt: post.createdAt };
  const older = { ...recent, id: 'older', text: '이전 댓글' };
  let finish!: (value: unknown) => void;
  mockGet.mockImplementation((key: string) => key === 'GET /users/me' ? Promise.resolve({ data: { id: account, membership: { crew: { isLeader: false } } } }) : key === 'GET /posts/{postId}/comments' ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve({ data: { ...post, comments: [recent], commentsNextCursor: 'older-cursor' } }));
  await mount();
  const { act } = require('react-test-renderer');
  const button = rendered.root.findAllByType('Button').find((node: any) => node.props.label === '이전 댓글 더 보기');
  act(() => { void button.props.onPress(); void button.props.onPress(); });
  expect(mockGet.mock.calls.filter(([key]) => key === 'GET /posts/{postId}/comments')).toEqual([['GET /posts/{postId}/comments', { postId: 'p1', cursor: 'older-cursor' }]]);
  await act(async () => finish({ data: { items: [older, recent], nextCursor: null } }));
  const comments = rendered.root.findAll((node: any) => node.props.comment && !node.props.sending).map((node: any) => node.props.comment.id);
  expect(comments).toEqual(['older', 'recent']);
  expect(rendered.root.findAllByType('Button').some((node: any) => node.props.label === '이전 댓글 더 보기')).toBe(false);
  expect(rendered.root.findByType('ScrollView').props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 2 });
});

test('새로고침 후 오래된 이전 댓글 응답이 복구된 목록에 섞이지 않는다', async () => {
  let finish!: (value: unknown) => void;
  const recent = { id: 'recent', author: post.author, text: '최근 댓글', createdAt: post.createdAt };
  mockGet.mockImplementation((key: string) => key === 'GET /users/me' ? Promise.resolve({ data: { id: account, membership: { crew: { isLeader: false } } } }) : key === 'GET /posts/{postId}/comments' ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve({ data: { ...post, comments: [recent], commentsNextCursor: 'older-cursor' } }));
  await mount();
  const { act } = require('react-test-renderer');
  act(() => { void rendered.root.findAllByType('Button').find((node: any) => node.props.label === '이전 댓글 더 보기').props.onPress(); });
  await act(async () => { await rendered.root.findByType('ScrollView').props.refreshControl.props.onRefresh(); });
  await act(async () => finish({ data: { items: [{ ...recent, id: 'stale' }], nextCursor: null } }));
  expect(rendered.root.findAll((node: any) => node.props.comment).map((node: any) => node.props.comment.id)).toEqual(['recent']);
});

test('맨 아래를 보던 중 입력란이 커져 목록이 줄면 다시 맨 아래로 맞춘다', async () => {
  const React = require('react');
  const { act, create } = require('react-test-renderer');
  const scrollToEnd = jest.fn();
  const Component = require('../../app/posts/[id]').default;
  await act(async () => { rendered = create(React.createElement(Component), { createNodeMock: () => ({ scrollToEnd }) }); });
  const list = () => rendered.root.findByType('ScrollView');
  const scrolled = (y: number) => ({ nativeEvent: { contentOffset: { y }, layoutMeasurement: { height: 600 }, contentSize: { height: 1000 } } });
  // 큰 글자에서 비운 입력란의 안내 문구가 두 줄이 되면 목록 높이만 줄고 내용 높이는 그대로다
  await act(async () => list().props.onMomentumScrollEnd(scrolled(400)));
  await act(async () => list().props.onLayout({ nativeEvent: { layout: { height: 560 } } }));
  expect(scrollToEnd).toHaveBeenCalledTimes(1);
  // 댓글을 보내 맨 아래로 내려가는 애니메이션 도중이어도 끝을 보고 있는 것으로 친다
  await act(async () => list().props.onScrollEndDrag(scrolled(100)));
  await act(async () => rendered.root.findByType('Field').props.onChangeText('새 댓글'));
  mockMutate.mockResolvedValueOnce({ data: { id: 'c9', author: { id: 'u1', nickname: '나', photoUrl: null, withdrawn: false }, text: '새 댓글', createdAt: '2026-10-01T00:00:00Z', seq: 9 } });
  await act(async () => rendered.root.find((n: any) => n.type === 'Button' && n.props.label === '남기기').props.onPress());
  await act(async () => list().props.onContentSizeChange());
  await act(async () => list().props.onLayout({ nativeEvent: { layout: { height: 520 } } }));
  expect(scrollToEnd).toHaveBeenCalledTimes(3);
  // 위로 올려 읽는 중이면 끌어내리지 않는다
  await act(async () => list().props.onScrollEndDrag(scrolled(100)));
  await act(async () => list().props.onLayout({ nativeEvent: { layout: { height: 600 } } }));
  expect(scrollToEnd).toHaveBeenCalledTimes(3);
});
