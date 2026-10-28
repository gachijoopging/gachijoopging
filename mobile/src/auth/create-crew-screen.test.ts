import React from 'react';
import CreateCrewScreen from '../../app/(onboarding)/create-crew';
import { currentAccount, rememberAccount } from './account';

let mockAccountFile: string | null = null;
jest.mock('expo-file-system', () => ({ Paths: { document: 'documents' }, File: class {
  get exists() { return mockAccountFile != null; }
  textSync() { return mockAccountFile; }
  write(text: string) { mockAccountFile = text; }
  delete() { mockAccountFile = null; }
} }));
const { act, create } = require('react-test-renderer');
const mockMutate = jest.fn();
const mockReset = jest.fn();
const mockListeners: Record<string, (e: unknown) => void> = {};
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../api/client', () => ({
  ApiError: class extends Error {
    code: string;
    constructor(mockCode: string) { super(mockCode); this.code = mockCode; }
  },
}));
jest.mock('../api/onboarding', () => ({ onboardingApi: { get: jest.fn(), mutate: (...a: unknown[]) => mockMutate(...a) } }));
jest.mock('./usePreventBack', () => ({ usePreventBack: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({
    reset: (...a: unknown[]) => mockReset(...a),
    dispatch: jest.fn(),
    addListener: (name: string, fn: (e: unknown) => void) => { mockListeners[name] = fn; return () => {}; },
  }),
}));
jest.mock('react-native', () => ({ View: 'View' }));
jest.mock('design-system/src', () => new Proxy({ space: {} }, { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) }));

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  mockMutate.mockReset().mockResolvedValue({ data: {} });
  mockReset.mockClear();
  mockAccountFile = null;
  rememberAccount({ id: 'u1', membership: { status: 'NONE' } });
});

let tree: ReturnType<typeof create>;
afterEach(() => act(() => tree.unmount()));
const find = (type: string, pred: (p: any) => boolean = () => true) => tree.root.findAll((n: any) => n.type === type && pred(n.props));
const button = () => find('Button', (p) => p.label === '크루 만들기')[0];

async function fill() {
  await act(async () => { tree = create(React.createElement(CreateCrewScreen)); });
  await act(async () => find('Field', (p) => p.label === '크루 이름')[0].props.onChangeText('  한강줍깅크루  '));
  expect(button().props.disabled).toBe(true);
  await act(async () => find('ListRow', (p) => p.title === '서울특별시')[0].props.onPress());
  expect(button().props.disabled).toBe(true);
  await act(async () => find('SelectRow', (p) => p.title === '비공개')[0].props.onPress());
}

test('가입 방식은 기본값 없이 시작한다', async () => {
  await act(async () => { tree = create(React.createElement(CreateCrewScreen)); });
  expect(find('SelectRow').map((n: any) => n.props.selected)).toEqual([false, false]);
});

test('이름·지역·가입 방식을 모두 골라야 만들 수 있고, 만들면 홈으로 간다', async () => {
  await fill();
  expect(button().props.disabled).toBe(false);
  await act(async () => button().props.onPress());
  expect(mockMutate).toHaveBeenCalledWith('POST /crews', { name: '한강줍깅크루', region: 'SEOUL', joinPolicy: 'APPROVAL' });
  expect(mockReset).toHaveBeenCalledWith({ index: 0, routes: [{ name: '(tabs)', params: { screen: 'index', params: { flash: '한강줍깅크루 크루를 만들었어요.' } } }] });
});

test('크루를 만들면 소속을 기억한다 — 직후 오프라인으로 재실행해도 1-6 에 멈추지 않는다', async () => {
  await fill();
  await act(async () => button().props.onPress());
  expect(currentAccount()).toEqual(expect.objectContaining({ id: 'u1', hasCrew: true }));
});

test('이미 있는 크루 이름이면 이름 칸 아래에 알리고 화면에 머문다', async () => {
  const { ApiError } = require('../api/client');
  mockMutate.mockRejectedValueOnce(new ApiError('CREW_NAME_TAKEN'));
  await fill();
  await act(async () => button().props.onPress());
  expect(find('Field', (p) => p.label === '크루 이름')[0].props.error).toBe('이미 사용 중인 크루 이름이에요.');
  expect(mockReset).not.toHaveBeenCalled();
  expect(currentAccount()?.hasCrew).toBe(false);
});

test('다른 기기에서 가입 신청 중이면 승인 대기로 간다', async () => {
  const { ApiError } = require('../api/client');
  mockMutate.mockRejectedValueOnce(new ApiError('JOIN_REQUEST_PENDING'));
  await fill();
  await act(async () => button().props.onPress());
  expect(mockReset).toHaveBeenCalledWith({
    index: 0,
    routes: [{ name: '(onboarding)/pending-approval', params: { flash: '승인 대기 중인 가입 요청이 있어요. 요청을 취소한 뒤 만들 수 있어요.' } }],
  });
});

test('입력한 것이 있으면 뒤로 가기 전에 그만둘지 묻는다', async () => {
  await fill();
  const preventDefault = jest.fn();
  await act(async () => mockListeners.beforeRemove({ preventDefault, data: { action: {} } }));
  expect(preventDefault).toHaveBeenCalled();
  expect(find('Dialog', (p) => p.title === '크루 만들기를 그만둘까요?')[0].props.visible).toBe(true);
});
