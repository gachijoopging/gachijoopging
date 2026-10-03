import React from 'react';
import LoginScreen from '../../app/(auth)/login';

const { act, create } = require('react-test-renderer');
const mockMutate = jest.fn();
const mockGet = jest.fn();
const mockReplace = jest.fn();
jest.mock('../api/onboarding', () => ({ onboardingApi: { get: (...a: unknown[]) => mockGet(...a), mutate: (...a: unknown[]) => mockMutate(...a) } }));
jest.mock('../auth/destination', () => ({ authenticatedDestination: async () => '/(tabs)/home' }));
jest.mock('../auth/account', () => ({ forgetAccount: jest.fn(), rememberAccount: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo/src/winter/fetch', () => ({ fetch: jest.fn() }));
jest.mock('react-native', () => ({ View: 'View', Image: 'Image', Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android ?? o.default } }));
jest.mock('design-system/src', () => new Proxy(
  { space: {}, size: {}, WORDMARK_RATIO: 1, useTheme: () => ({ scheme: 'light' }) },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : String(key)) },
));

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => { mockMutate.mockReset().mockResolvedValue(undefined); mockGet.mockReset().mockResolvedValue({ data: { id: 'u1' } }); mockReplace.mockClear(); });

let tree: ReturnType<typeof create>;
afterEach(() => act(() => tree.unmount()));
const field = (label: string) => tree.root.findAll((n: any) => n.type === 'Field' && n.props.label === label)[0];
const loginButton = () => tree.root.findAll((n: any) => n.type === 'Button' && n.props.label === '로그인')[0];

async function submit() {
  await act(async () => { tree = create(React.createElement(LoginScreen)); });
  await act(async () => field('이메일').props.onChangeText('me@example.com'));
  await act(async () => field('비밀번호').props.onChangeText('password1'));
  await act(async () => loginButton().props.onPress());
}

test('로그인에 성공하면 떠나는 화면을 다시 그리지 않는다', async () => {
  await submit();
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
  // 닫히는 전환 중에 다시 그리면 Android 16 Fabric 이 addViewAt 에서 죽는다
  expect(loginButton().props.loading).toBe(true);
});

test('로그인이 실패하면 버튼이 다시 눌린다', async () => {
  mockMutate.mockRejectedValueOnce(new Error('network'));
  await submit();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(loginButton().props.loading).toBe(false);
});

test('내 정보를 못 불러와도 버튼이 다시 눌린다', async () => {
  mockGet.mockRejectedValueOnce(new Error('network'));
  await submit();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(loginButton().props.loading).toBe(false);
});
