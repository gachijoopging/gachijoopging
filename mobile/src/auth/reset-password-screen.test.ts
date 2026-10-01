import React from 'react';
import ResetPasswordScreen from '../../app/(auth)/reset-password/index';

const { act, create } = require('react-test-renderer');
const mockMutate = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('../api/client', () => ({
  ApiError: class extends Error {
    code: string;
    fields: unknown;
    constructor(mockCode: string, mockFields?: unknown) { super(mockCode); this.code = mockCode; this.fields = mockFields; }
  },
  createMockClient: () => ({ get: jest.fn(), mutate: (...args: unknown[]) => mockMutate(...args) }),
}));
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), push: (...a: unknown[]) => mockPush(...a), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('react-native', () => ({ View: 'View', Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android ?? o.default } }));
jest.mock('design-system/src', () => new Proxy({ space: {} }, { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) }));

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => { mockMutate.mockReset().mockResolvedValue(undefined); mockReplace.mockClear(); mockPush.mockClear(); });

let tree: ReturnType<typeof create>;
afterEach(() => act(() => tree.unmount()));
const field = (label: string) => tree.root.findAll((n: any) => n.type === 'Field' && n.props.label === label)[0];
const button = (label: string) => tree.root.findAll((n: any) => n.type === 'Button' && n.props.label === label)[0];

async function sendMail() {
  await act(async () => { tree = create(React.createElement(ResetPasswordScreen)); });
  await act(async () => field('이메일').props.onChangeText('me@example.com'));
  await act(async () => button('재설정 메일 보내기').props.onPress());
}

async function fill(code: string) {
  await act(async () => field('인증 코드').props.onChangeText(code));
  await act(async () => field('새 비밀번호').props.onChangeText('newpass123'));
  await act(async () => field('새 비밀번호 확인').props.onChangeText('newpass123'));
  await act(async () => button('비밀번호 변경').props.onPress());
}

test('메일을 보낸 뒤 다른 화면으로 가지 않고 같은 화면에서 코드와 새 비밀번호로 바꾼다', async () => {
  await sendMail();
  expect(mockPush).not.toHaveBeenCalled();
  await fill('123456');
  expect(mockMutate).toHaveBeenLastCalledWith('POST /auth/password-reset/confirm', { email: 'me@example.com', code: '123456', newPassword: 'newpass123' });
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/login', params: { justReset: '1' } });
  // 떠나는 화면을 다시 그리면 전환 중인 뷰를 Fabric 이 다시 붙이려다 죽는다
  expect(button('비밀번호 변경').props.loading).toBe(true);
});

test('틀린 코드는 코드 칸 아래에 보이고 화면에 머문다', async () => {
  await sendMail();
  const { ApiError } = require('../api/client');
  mockMutate.mockRejectedValueOnce(new ApiError('VALIDATION', [{ field: 'code', code: 'INVALID' }]));
  await fill('000000');
  expect(field('인증 코드').props.error).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
});

test('메일을 다시 보내면 지난 코드의 오류가 지워진다', async () => {
  await sendMail();
  const { ApiError } = require('../api/client');
  mockMutate.mockRejectedValueOnce(new ApiError('VALIDATION', [{ field: 'code', code: 'INVALID' }]));
  await fill('000000');
  await act(async () => button('메일 다시 보내기').props.onPress());
  expect(field('인증 코드').props.error).toBeUndefined();
  expect(field('인증 코드').props.value).toBe('');
});

test('메일을 보낸 뒤에도 이메일을 바꿔 다시 보낼 수 있다', async () => {
  await sendMail();
  const change = tree.root.findAll((n: any) => n.type === 'LinkText' && n.props.label === '이메일 바꾸기')[0];
  await act(async () => change.props.onPress());
  expect(field('이메일').props.value).toBe('me@example.com');
  expect(field('인증 코드')).toBeUndefined();
});

test('이메일을 바꾸면 입력하던 새 비밀번호도 지운다', async () => {
  await sendMail();
  await act(async () => field('새 비밀번호').props.onChangeText('typed-secret'));
  const change = tree.root.findAll((n: any) => n.type === 'LinkText' && n.props.label === '이메일 바꾸기')[0];
  await act(async () => change.props.onPress());
  await act(async () => button('재설정 메일 보내기').props.onPress());
  expect(field('새 비밀번호').props.value).toBe('');
});
