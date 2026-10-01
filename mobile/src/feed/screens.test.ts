jest.mock('../api/media', () => ({ mediaFile: async (uri: string) => ({ uri, name: 'photo.jpg', type: 'image/jpeg' }) }));
import React from 'react';
import FeedScreen from '../../app/(tabs)/feed';
import ActivityDetailScreen from '../../app/records/[id]';

const { act, create } = require('react-test-renderer');
const mockGet = jest.fn();
const mockMutate = jest.fn();
const mockCapture = jest.fn();
const mockFiles = new Map<string, string>();
let mockBeforeRemove: ((event: { preventDefault: () => void }) => void) | null = null;
const mockNavigation = {
  goBack: jest.fn(),
  addListener: (_name: string, callback: typeof mockBeforeRemove) => {
    mockBeforeRemove = callback;
    return () => { if (mockBeforeRemove === callback) mockBeforeRemove = null; };
  },
};
let mockNetwork = { isConnected: true, isInternetReachable: true };
jest.mock('expo-network', () => ({ useNetworkState: () => mockNetwork }));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    private name: string;
    constructor(_directory: string, name: string) { this.name = name; }
    get exists() { return mockFiles.has(this.name); }
    textSync() { return mockFiles.get(this.name); }
    write(text: string) { mockFiles.set(this.name, text); }
    delete() { mockFiles.delete(this.name); }
  },
}));
jest.mock('../activity/ShareCard', () => ({
  ShareCard: 'ShareCard', useShareImage: () => ({ ref: null, capture: () => mockCapture() }),
}));
jest.mock('../api/client', () => ({
  ApiError: class extends Error {},
  createMockClient: () => ({ get: (...args: unknown[]) => mockGet(...args), mutate: (...args: unknown[]) => mockMutate(...args) }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
  useLocalSearchParams: () => ({ id: 'a1' }),
  useNavigation: () => mockNavigation,
}));
jest.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
jest.mock('../../modules/kakao-map', () => ({ KakaoMapView: 'KakaoMapView' }));
jest.mock('react-native', () => new Proxy({
  View: 'View', Pressable: 'Pressable', FlatList: 'FlatList', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', Image: 'Image',
  useWindowDimensions: () => ({ width: 400, height: 800 }),
}, { get: (target, key) => key in target ? target[key as keyof typeof target] : jest.requireActual('react-native')[key] }));
jest.mock('design-system/src', () => new Proxy({
  space: { sm: 8, md: 16, lg: 24, xs: 4 }, size: { minTouch: 48 }, radius: {},
  useRipple: () => undefined, useTheme: () => ({ colors: {} }),
  pressedOpacity: () => 1,
}, { get: (target, key) => key === 'Dialog' ? (props: any) => require('react').createElement('Dialog', props, props.children, props.actions) : key in target ? target[key as keyof typeof target] : String(key) }));
jest.mock('../ui/useFlash', () => ({ useFlash: () => require('react').useState(null) }));
jest.mock('../notifications/notifications', () => ({ relativeTime: () => '방금' }));

const initialItem = { id: 'i1', category: 'CAN', quantity: 2, source: 'MANUAL', photoId: null };
const detail = { id: 'a1', user: { id: 'u1', nickname: '나' }, status: 'ENDED', startedAt: '2026-09-30T00:00:00Z', durationSec: 60, distanceM: 10, steps: null, locationShared: false, itemCount: 2, byCategory: { CAN: 2 }, route: [], photos: [], items: [initialItem] };
const me = { data: { id: 'u1', membership: { status: 'MEMBER', crew: { isLeader: false } } } };
let rendered: ReturnType<typeof create>;

beforeEach(() => {
  mockGet.mockReset();
  mockMutate.mockReset().mockResolvedValue({ data: {} });
  mockCapture.mockReset().mockResolvedValue('file:///share.png');
  mockFiles.clear();
  mockBeforeRemove = null;
  mockNavigation.goBack.mockReset();
  mockNetwork = { isConnected: true, isInternetReachable: true };
  jest.mocked(require('expo-router').router.push).mockClear();
});
afterEach(async () => { if (rendered) await act(async () => rendered.unmount()); });

async function mountDetail() {
  mockGet.mockImplementation((key: string) => Promise.resolve(key === 'GET /users/me' ? me : { data: detail }));
  await act(async () => { rendered = create(React.createElement(ActivityDetailScreen)); });
  await act(async () => rendered.root.findAllByType('Button').find((b: any) => b.props.label === '줍기 목록 수정').props.onPress());
}

test('이전 탭의 추가 페이지가 새 탭 목록에 섞이지 않는다', async () => {
  let finishMore!: (value: unknown) => void;
  const post = (id: string) => ({ id, author: { id: 'u1', nickname: '나', photoUrl: null, withdrawn: false }, text: id, visibility: 'CREW', media: [], likeCount: 0, liked: false, commentCount: 0, createdAt: '2026-09-30T00:00:00Z' });
  mockGet.mockImplementation((key: string, query: { cursor?: string; scope?: string }) => {
    if (key === 'GET /users/me') return Promise.resolve(me);
    if (query.cursor) return new Promise((resolve) => { finishMore = resolve; });
    return Promise.resolve({ data: { items: [post(query.scope === 'MINE' ? 'mine' : 'crew')], nextCursor: 'next' } });
  });
  await act(async () => { rendered = create(React.createElement(FeedScreen)); });
  await act(async () => rendered.root.findByType('Tabs').props.onChange('MINE'));
  await act(async () => { void rendered.root.findByType('FlatList').props.onEndReached(); });
  await act(async () => rendered.root.findByType('Tabs').props.onChange('CREW'));
  await act(async () => finishMore({ data: { items: [post('stale-private')], nextCursor: null } }));
  expect(rendered.root.findByType('FlatList').props.data.map((p: { id: string }) => p.id)).toEqual(['crew']);
});

test('수량 입력이 잘못되면 변경된 항목의 저장을 막는다', async () => {
  await mountDetail();
  await act(async () => rendered.root.findAllByType('Chip').find((c: any) => c.props.accessibilityLabel === '항목 1 카테고리, 종이').props.onPress());
  const stepper = rendered.root.findByType('NumberStepper');
  expect(stepper.props.onValidityChange).toEqual(expect.any(Function));
  await act(async () => stepper.props.onValidityChange(false));
  const save = rendered.root.findAllByType('Button').find((b: any) => b.props.label === '저장');
  expect(save.props.disabled).toBe(true);
  await act(async () => save.props.onPress());
  expect(mockMutate).not.toHaveBeenCalled();
});

test('항목 삭제 뒤 시트를 닫고 다시 열어도 삭제한 항목이 돌아오지 않는다', async () => {
  await mountDetail();
  await act(async () => rendered.root.findAllByType('Button').find((b: any) => b.props.accessibilityLabel === '항목 1 삭제').props.onPress());
  mockGet.mockImplementation((key: string) => Promise.resolve(key === 'GET /users/me' ? me : { data: { ...detail, itemCount: 0, byCategory: {}, items: [] } }));
  const dialog = rendered.root.findAllByType('Dialog').find((d: any) => d.props.title === '이 항목을 삭제할까요?');
  await act(async () => dialog.findAllByType('Button').find((b: any) => b.props.label === '삭제').props.onPress());
  expect(rendered.root.findByType('MetricSplit').props.items[0].value).toBe('0개');
  await act(async () => rendered.root.findAllByType('Button').find((b: any) => b.props.label === '닫기').props.onPress());
  await act(async () => rendered.root.findAllByType('Button').find((b: any) => b.props.label === '줍기 목록 수정').props.onPress());
  expect(rendered.root.findAllByType('NumberStepper').length).toBe(0);
});

test('미저장 수량은 시트를 닫았다 다시 열어도 유지한다', async () => {
  await mountDetail();
  await act(async () => rendered.root.findByType('NumberStepper').props.onChange(7));
  await act(async () => rendered.root.findAllByType('Button').find((b: any) => b.props.label === '닫기').props.onPress());
  await act(async () => rendered.root.findAllByType('Button').find((b: any) => b.props.label === '줍기 목록 수정').props.onPress());
  expect(rendered.root.findByType('NumberStepper').props.value).toBe(7);
});

test('공유는 기본 경로 제외로 생성한 이미지 URI를 작성 화면에 넘긴다', async () => {
  await mountDetail();
  expect(rendered.root.findByType('ShareCard').props.includeRoute).toBe(false);
  await act(async () => rendered.root.findAllByType('Button').find((b: any) => b.props.label === '피드에 공유하기').props.onPress());
  expect(mockCapture).toHaveBeenCalledTimes(1);
  expect(require('expo-router').router.push).toHaveBeenCalledWith({ pathname: '/posts/new', params: { imageUri: 'file:///share.png' } });
});

test('오프라인 캐시를 보여 주면서 수정·공유·삭제 요청은 막는다', async () => {
  mockFiles.set('activity-detail-u1-a1.json', JSON.stringify(detail));
  mockFiles.set('current-account.json', JSON.stringify({ id: 'u1', hasCrew: true }));
  mockNetwork = { isConnected: false, isInternetReachable: false };
  mockGet.mockRejectedValue(new Error('offline'));
  await act(async () => { rendered = create(React.createElement(ActivityDetailScreen)); });
  expect(rendered.root.findByType('MetricSplit').props.items[0].value).toBe('2개');
  const buttons = rendered.root.findAllByType('Button');
  expect(buttons.find((b: any) => b.props.label === '줍기 목록 수정').props.disabled).toBe(true);
  expect(buttons.find((b: any) => b.props.label === '피드에 공유하기').props.disabled).toBe(true);
  expect(rendered.root.findByType('AppHeader').props.action.props.disabled).toBe(true);
  await act(async () => buttons.find((b: any) => b.props.label === '피드에 공유하기').props.onPress());
  const deletion = rendered.root.findAllByType('Dialog').find((d: any) => d.props.title === '활동 기록을 삭제할까요?');
  await act(async () => deletion.findAllByType('Button').find((b: any) => b.props.label === '삭제').props.onPress());
  expect(mockCapture).not.toHaveBeenCalled();
  expect(mockMutate).not.toHaveBeenCalled();
  expect(mockGet).not.toHaveBeenCalled();
});

test('오프라인 상세는 다른 계정의 캐시를 열지 않는다', async () => {
  mockFiles.set('activity-detail-u1-a1.json', JSON.stringify(detail));
  mockFiles.set('current-account.json', JSON.stringify({ id: 'u2', hasCrew: true }));
  mockNetwork = { isConnected: false, isInternetReachable: false };
  mockGet.mockRejectedValue(new Error('offline'));
  await act(async () => { rendered = create(React.createElement(ActivityDetailScreen)); });
  expect(rendered.root.findAllByType('MetricSplit').length).toBe(0);
  expect(rendered.root.findAllByType('ErrorState').length).toBe(1);
  expect(mockGet).not.toHaveBeenCalled();
});

test('항목 저장 요청 중에는 화면 이탈을 막고 완료 후에는 허용한다', async () => {
  await mountDetail();
  await act(async () => rendered.root.findByType('NumberStepper').props.onChange(3));
  let finishSave!: (value: unknown) => void;
  mockMutate.mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
  await act(async () => {
    void rendered.root.findAllByType('Button').find((b: any) => b.props.label === '저장').props.onPress();
  });
  const pendingEvent = { preventDefault: jest.fn() };
  mockBeforeRemove!(pendingEvent);
  expect(pendingEvent.preventDefault).toHaveBeenCalledTimes(1);
  expect(rendered.root.findByType('AppHeader').props.backDisabled).toBe(true);
  await act(async () => finishSave({ data: {} }));
  const completedEvent = { preventDefault: jest.fn() };
  mockBeforeRemove!(completedEvent);
  expect(completedEvent.preventDefault).not.toHaveBeenCalled();
  expect(rendered.root.findByType('AppHeader').props.backDisabled).toBe(false);
});

test('타인의 공유하지 않은 경로는 상세 지도에 표시하지 않는다', async () => {
  mockGet.mockImplementation((key: string) => Promise.resolve(key === 'GET /users/me' ? me : {
    data: { ...detail, user: { id: 'u2', nickname: '다른 크루원' }, route: [[127, 37], [127.001, 37.001]] },
  }));
  await act(async () => { rendered = create(React.createElement(ActivityDetailScreen)); });
  // 경로가 없어서가 아니라 공유하지 않아서 안 보이므로, "기록되지 않았어요" 대신 지도 자리를 비우고 안내 배너가 이유를 말한다
  expect(rendered.root.findAll((v: any) => v.props.accessibilityLabel === '이동 경로 지도' || v.props.children === '경로가 기록되지 않았어요')).toHaveLength(0);
  expect(rendered.root.findAllByType('ShareCard').length).toBe(0);
});

test('활동 삭제 중 이탈을 막지만 성공 뒤 내부 뒤로 가기는 허용한다', async () => {
  await mountDetail();
  let finishDelete!: (value: unknown) => void;
  mockMutate.mockImplementation(() => new Promise((resolve) => { finishDelete = resolve; }));
  const dialog = rendered.root.findAllByType('Dialog').find((d: any) => d.props.title === '활동 기록을 삭제할까요?');
  await act(async () => { void dialog.findAllByType('Button').find((b: any) => b.props.label === '삭제').props.onPress(); });
  const pendingEvent = { preventDefault: jest.fn() };
  mockBeforeRemove!(pendingEvent);
  expect(pendingEvent.preventDefault).toHaveBeenCalledTimes(1);
  const internalEvent = { preventDefault: jest.fn() };
  mockNavigation.goBack.mockImplementation(() => mockBeforeRemove!(internalEvent));
  await act(async () => finishDelete({ data: {} }));
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  expect(internalEvent.preventDefault).not.toHaveBeenCalled();
  expect(mockFiles.has('activity-detail-u1-a1.json')).toBe(false);
});
