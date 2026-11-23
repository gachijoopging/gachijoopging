import React from 'react';
import CrewChoiceScreen from '../../app/(onboarding)/crew-choice';
import { forgetAccount, rememberAccount } from './account';

let mockAccountFile: string | null = null;
jest.mock('expo-file-system', () => ({ Paths: { document: 'documents' }, File: class {
  get exists() { return mockAccountFile != null; }
  textSync() { return mockAccountFile; }
  write(text: string) { mockAccountFile = text; }
  delete() { mockAccountFile = null; }
} }));
const { act, create } = require('react-test-renderer');
const mockGet = jest.fn();
const mockPush = jest.fn();
const mockReset = jest.fn();
let mockDestination = '/crew-choice';
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../api/onboarding', () => ({ onboardingApi: { get: (...a: unknown[]) => mockGet(...a), mutate: jest.fn() } }));
jest.mock('./destination', () => ({ authenticatedDestination: async () => mockDestination }));
jest.mock('../ui/useFlash', () => ({ useFlash: () => [null, jest.fn()] }));
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn() },
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ reset: (...a: unknown[]) => mockReset(...a) }),
}));
jest.mock('react-native', () => ({
  View: 'View',
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  BackHandler: { addEventListener: () => ({ remove: () => {} }), exitApp: jest.fn() },
}));
jest.mock('design-system/src', () => new Proxy({ space: {} }, { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) }));

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mockGet.mockReset().mockResolvedValue({ data: { profileComplete: true, membership: { status: 'NONE' } } });
  mockPush.mockClear();
  mockReset.mockClear();
  mockDestination = '/crew-choice';
  mockAccountFile = null;
  rememberAccount({ id: 'u1', membership: { status: 'NONE' } });
});

let tree: ReturnType<typeof create>;
afterEach(() => act(() => tree.unmount()));
const card = (label: string) => tree.root.findAll((n: any) => n.type === 'Card' && n.props.accessibilityLabel === label)[0];

test('두 카드는 소속을 다시 확인한 뒤 크루 찾기·크루 만들기 화면으로 간다', async () => {
  await act(async () => { tree = create(React.createElement(CrewChoiceScreen)); });
  await act(async () => card('기존 크루에 들어가기, 크루 찾기').props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/search-crew');
  await act(async () => card('크루 만들기').props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/create-crew');
  expect(mockGet).toHaveBeenCalledTimes(2);
});

test('내 활동 기록은 미가입자에게도 열린다', async () => {
  await act(async () => { tree = create(React.createElement(CrewChoiceScreen)); });
  const records = tree.root.findAll((n: any) => n.type === 'Button' && n.props.label === '내 활동 기록 보기')[0];
  await act(async () => records.props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/records');
});

test('크루 선택 화면에서 설정으로 갈 수 있다', async () => {
  await act(async () => { tree = create(React.createElement(CrewChoiceScreen)); });
  const action = tree.root.findAll((n: any) => n.type === 'AppHeader')[0].props.action;
  expect(action?.props.label).toBe('설정');
  await act(async () => action.props.onPress());
  expect(mockPush).toHaveBeenCalledWith('/settings');
});

const deferred = () => { let resolve!: (value: unknown) => void; let reject!: (error: Error) => void; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const banners = () => tree.root.findAll((n: any) => n.type === 'Banner');
async function checkPending() {
  const request = deferred();
  mockGet.mockReturnValue(request.promise);
  await act(async () => { tree = create(React.createElement(CrewChoiceScreen)); });
  await act(async () => { card('크루 만들기').props.onPress(); });
  return request;
}

test('확인에 실패해도 계정이 그대로면 안내를 띄우고 다음 화면으로 간다', async () => {
  const request = await checkPending();
  await act(async () => request.reject(new Error('OFFLINE')));
  expect(banners()).toHaveLength(1);
  expect(mockPush).toHaveBeenCalledWith('/create-crew');
});

test.each([
  ['로그아웃으로', null],
  ['다른 계정 로그인으로', 'u2'],
] as const)('소속을 확인하는 사이 %s 계정이 바뀌면 실패 응답이 와도 다음 화면으로 보내지 않는다', async (_label, after) => {
  const request = await checkPending();
  if (after) rememberAccount({ id: after, membership: { status: 'NONE' } });
  else forgetAccount();
  await act(async () => request.reject(new Error('TOKEN_EXPIRED')));
  expect(mockPush).not.toHaveBeenCalled();
  expect(banners()).toHaveLength(0);
  expect(card('크루 만들기').props.disabled).toBe(false);
});

test('소속을 확인하는 사이 다른 계정으로 로그인하면 성공 응답이 와도 이동시키지 않는다', async () => {
  mockDestination = '/(tabs)';
  const request = await checkPending();
  rememberAccount({ id: 'u2', membership: { status: 'NONE' } });
  await act(async () => request.resolve({ data: { profileComplete: true, membership: { status: 'MEMBER' } } }));
  expect(mockReset).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
});

test('소속을 확인하는 사이 계정이 그대로면 바뀐 소속대로 이동한다', async () => {
  mockDestination = '/(tabs)';
  const request = await checkPending();
  await act(async () => request.resolve({ data: { profileComplete: true, membership: { status: 'MEMBER' } } }));
  expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: '(tabs)', params: undefined }] });
});
