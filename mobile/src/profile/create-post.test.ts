jest.mock('../api/media', () => ({ mediaFile: async (uri: string) => ({ uri, name: 'photo.jpg', type: 'image/jpeg' }) }));
import React from 'react';
import CreatePostScreen from '../../app/posts/new';
import { emptyDraft, keepPhoto, loadDraft, rememberPostScope, saveDraft } from './post-draft';

const { act, create } = require('react-test-renderer');
const mockFiles = new Map<string, string>();
const mockGet = jest.fn();
const mockMutate = jest.fn();
const mockPick = jest.fn();
let mockUuid = 0;
let mockParams: { imageUri?: string } = {};
let mockOffline = false;
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuid}` }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: (...args: unknown[]) => mockPick(...args) }));
jest.mock('expo-network', () => ({ useNetworkState: () => ({ isConnected: !mockOffline, isInternetReachable: !mockOffline }) }));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    uri: string;
    constructor(...parts: string[]) { this.uri = parts.join('/'); }
    get exists() { return mockFiles.has(this.uri); }
    textSync() { return mockFiles.get(this.uri); }
    write(text: string) { mockFiles.set(this.uri, text); }
    delete() { mockFiles.delete(this.uri); }
    copy(target: { uri: string }) {
      if (!mockFiles.has(this.uri)) throw new Error('missing image');
      mockFiles.set(target.uri, mockFiles.get(this.uri)!);
    }
  },
}));
jest.mock('../api/client', () => ({ peek: () => undefined, forget: () => {},
  ApiError: class extends Error {},
  createMockClient: () => ({ get: (...args: unknown[]) => mockGet(...args), mutate: (...args: unknown[]) => mockMutate(...args) }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../auth/usePreventBack', () => ({ usePreventBack: () => {} }));
jest.mock('react-native', () => new Proxy({
  View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', Image: 'Image', ActivityIndicator: 'ActivityIndicator',
}, { get: (target, key) => key in target ? target[key as keyof typeof target] : jest.requireActual('react-native')[key] }));
jest.mock('design-system/src', () => new Proxy({
  space: { sm: 8, md: 16, lg: 24, xs: 4 }, radius: {}, borderWidth: {},
  useReduceMotion: () => true, useRipple: () => undefined, useTheme: () => ({ colors: {} }), pressedOpacity: () => 1,
}, { get: (target, key) => key in target ? target[key as keyof typeof target] : String(key) }));

const scope = { userId: 'u1', crewId: 'c1' };
const me = (id = 'u1') => ({ data: { id, membership: { status: 'MEMBER', crew: { id: 'c1' } } } });
let rendered: ReturnType<typeof create>;
const OriginalFormData = global.FormData;
beforeEach(() => {
  mockFiles.clear();
  mockUuid = 0;
  mockParams = {};
  mockOffline = false;
  mockGet.mockReset().mockResolvedValue(me());
  mockMutate.mockReset().mockResolvedValue({ data: { mediaId: 'uploaded' } });
  mockPick.mockReset();
  global.FormData = class {
    parts: [string, unknown][] = [];
    append(key: string, value: unknown) { this.parts.push([key, value]); }
  } as unknown as typeof FormData;
});
afterEach(async () => { if (rendered) await act(async () => rendered.unmount()); global.FormData = OriginalFormData; });
const mount = async () => { await act(async () => { rendered = create(React.createElement(CreatePostScreen)); }); };
const publish = async () => { await act(async () => rendered.root.findAllByType('Button').find((button: any) => button.props.label === '게시하기').props.onPress()); };

test('요약 이미지는 기존 초안의 첫 사진으로 붙고 총 10장을 넘지 않는다', async () => {
  mockFiles.set('summary.png', 'summary');
  mockFiles.set('picker.jpg', 'photo');
  const photos = Array.from({ length: 9 }, (_, index) => keepPhoto({ uri: 'picker.jpg', name: 'photo.jpg', type: 'image/jpeg' }, `existing-${index}`));
  saveDraft(scope, { ...emptyDraft(), photos });
  mockParams = { imageUri: 'summary.png' };
  await mount();
  const saved = loadDraft(scope);
  expect(saved.photos.length).toBe(10);
  expect(saved.photos[0].sourceUri).toBe('summary.png');
  expect(saved.photos.slice(1).map((photo) => photo.key)).toEqual(photos.map((photo) => photo.key));
  expect(rendered.root.findAllByType('Pressable').some((button: any) => button.props.accessibilityLabel?.startsWith('사진 추가'))).toBe(false);
});

test('응답 유실 재시도는 같은 게시 id를 쓰고 본문 변경 후에는 새 id를 쓴다', async () => {
  await mount();
  mockMutate.mockRejectedValue(new Error('lost response'));
  await act(async () => rendered.root.findByType('Field').props.onChangeText('첫 글'));
  await publish();
  const first = mockMutate.mock.calls[0][1].id;
  await act(async () => rendered.unmount());
  await mount();
  await publish();
  expect(mockMutate.mock.calls[1][1].id).toBe(first);
  await act(async () => rendered.root.findByType('Field').props.onChangeText('바뀐 글'));
  await publish();
  expect(mockMutate.mock.calls[2][1].id).not.toBe(first);
  expect(loadDraft(scope).text).toBe('바뀐 글');
});

test('사진 재시도는 같은 업로드 id를 쓰고 성공한 사진은 다시 올리지 않는다', async () => {
  mockFiles.set('summary.png', 'summary');
  mockParams = { imageUri: 'summary.png' };
  await mount();
  let uploadCount = 0;
  mockMutate.mockImplementation((key: string) => {
    if (key === 'POST /media') return ++uploadCount === 1 ? Promise.reject(new Error('lost media response')) : Promise.resolve({ data: { mediaId: 'uploaded' } });
    return Promise.reject(new Error('post failed'));
  });
  await publish();
  const firstId = mockMutate.mock.calls[0][1].parts.find(([key]: [string, unknown]) => key === 'mediaId')[1];
  await act(async () => rendered.root.findAllByType('IconButton').find((button: any) => button.props.icon === 'alert-circle').props.onPress());
  const retryId = mockMutate.mock.calls[1][1].parts.find(([key]: [string, unknown]) => key === 'mediaId')[1];
  expect(retryId).toBe(firstId);
  expect(mockMutate.mock.calls.filter(([key]: [string]) => key === 'POST /crew/posts').length).toBe(0);
  await publish();
  expect(mockMutate.mock.calls.filter(([key]: [string]) => key === 'POST /media').length).toBe(2);
  expect(loadDraft(scope).photos[0].mediaId).toBe('uploaded');
});

test('다른 계정이 열면 앞 계정의 비공개 글과 사진을 보여 주지 않는다', async () => {
  saveDraft(scope, { ...emptyDraft(), text: '비공개 내용', visibility: 'PRIVATE' });
  mockGet.mockResolvedValue(me('u2'));
  await mount();
  expect(rendered.root.findByType('Field').props.value).toBe('');
  expect(loadDraft(scope).text).toBe('비공개 내용');
  expect(loadDraft({ userId: 'u2', crewId: 'c1' })).toEqual(emptyDraft());
});

test('이미 10장인 초안은 요약 이미지 진입 때문에 마지막 사진을 잃지 않는다', async () => {
  mockFiles.set('summary.png', 'summary');
  mockFiles.set('picker.jpg', 'photo');
  const photos = Array.from({ length: 10 }, (_, index) => keepPhoto({ uri: 'picker.jpg', name: 'photo.jpg', type: 'image/jpeg' }, `existing-${index}`));
  saveDraft(scope, { ...emptyDraft(), photos });
  mockParams = { imageUri: 'summary.png' };
  await mount();
  expect(loadDraft(scope).photos.map((photo) => photo.key)).toEqual(photos.map((photo) => photo.key));
  await act(async () => rendered.root.findAllByType('IconButton').find((button: any) => button.props.label === '10번째 사진 삭제').props.onPress());
  const saved = loadDraft(scope);
  expect(saved.photos.length).toBe(10);
  expect(saved.photos[0].sourceUri).toBe('summary.png');
  expect(saved.photos.slice(1).map((photo) => photo.key)).toEqual(photos.slice(0, 9).map((photo) => photo.key));
});

test('사진을 골라 뒤로 옮기면 파일과 업로드 id를 유지한 채 순서를 바꾼다', async () => {
  mockFiles.set('picker.jpg', 'photo');
  const photos = ['a', 'b'].map((key) => keepPhoto({ uri: 'picker.jpg', name: 'photo.jpg', type: 'image/jpeg' }, key));
  saveDraft(scope, { ...emptyDraft(), photos, requestId: 'old-post-id' });
  await mount();
  const first = rendered.root.findAllByType('Pressable').find((button: any) => button.props.accessibilityLabel === '대표 사진, 1번째');
  // 가로 스크롤 안의 길게 눌러 끌기는 스크롤과 다퉈 자주 놓친다. 순서는 골라서 옮기기 하나로만 바꾼다
  expect(first.props.onLongPress).toBeUndefined();
  expect(first.props.onTouchMove).toBeUndefined();
  await act(async () => first.props.onPress());
  await act(async () => rendered.root.findAllByType('Button').find((button: any) => button.props.label === '뒤로 옮기기').props.onPress());
  expect(loadDraft(scope).photos.map((photo) => photo.key)).toEqual(['b', 'a']);
  expect(loadDraft(scope).requestId).toBeNull();
  expect(mockFiles.has(photos[0].uri)).toBe(true);
  expect(mockFiles.has(photos[1].uri)).toBe(true);
});

test('온라인 계정 조회가 늦게 끝나도 새 계정의 오프라인 초안을 덮어쓰지 않는다', async () => {
  const nextScope = { userId: 'u2', crewId: 'c2' };
  rememberPostScope(nextScope);
  saveDraft(nextScope, { ...emptyDraft(), text: '새 계정의 초안' });
  mockFiles.set('documents/current-account.json', JSON.stringify({ id: 'u1', hasCrew: true }));
  let finishOld!: (value: unknown) => void;
  mockGet.mockImplementation(() => new Promise((resolve) => { finishOld = resolve; }));
  await mount();
  mockFiles.set('documents/current-account.json', JSON.stringify({ id: 'u2', hasCrew: true }));
  mockOffline = true;
  await act(async () => rendered.update(React.createElement(CreatePostScreen)));
  expect(rendered.root.findByType('Field').props.value).toBe('새 계정의 초안');
  await act(async () => finishOld(me('u1')));
  expect(rendered.root.findByType('Field').props.value).toBe('새 계정의 초안');
  expect(JSON.parse(mockFiles.get('documents/current-account.json')!).id).toBe('u2');
  expect(loadDraft(nextScope).text).toBe('새 계정의 초안');
});
