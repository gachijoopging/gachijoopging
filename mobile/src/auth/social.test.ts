const mockKakaoLogin = jest.fn();
const mockGoogle = { configure: jest.fn(), hasPlayServices: jest.fn(), signOut: jest.fn(), signIn: jest.fn() };
let mockReal = true;
jest.mock('../api/config', () => ({ apiConfig: { get real() { return mockReal; } } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { googleWebClientId: 'web-client' } } } }));
jest.mock('@react-native-seoul/kakao-login', () => ({ login: () => mockKakaoLogin() }));
jest.mock('@react-native-google-signin/google-signin', () => ({
  get GoogleSignin() { return mockGoogle; },
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
  isCancelledResponse: (r: { type: string }) => r.type === 'cancelled',
  isErrorWithCode: (e: unknown) => typeof e === 'object' && e != null && 'code' in e,
}));
import { providerToken } from './social';

beforeEach(() => {
  mockReal = true;
  mockKakaoLogin.mockReset();
  Object.values(mockGoogle).forEach((fn) => fn.mockReset().mockResolvedValue(undefined));
});

test('목 모드에서는 SDK 를 부르지 않는다', async () => {
  mockReal = false;
  await expect(providerToken('kakao')).resolves.toBe('mock-provider-token');
  expect(mockKakaoLogin).not.toHaveBeenCalled();
});

test('카카오는 access token 을, 사용자가 닫으면 null 을 돌려준다', async () => {
  mockKakaoLogin.mockResolvedValueOnce({ accessToken: 'kakao-access' });
  await expect(providerToken('kakao')).resolves.toBe('kakao-access');
  mockKakaoLogin.mockRejectedValueOnce(new Error('user cancelled.'));
  await expect(providerToken('kakao')).resolves.toBeNull();
  mockKakaoLogin.mockRejectedValueOnce(new Error('KOE101'));
  await expect(providerToken('kakao')).rejects.toThrow('KOE101');
});

test('구글은 웹 클라이언트 ID 로 설정해 ID token 을, 취소면 null 을 돌려준다', async () => {
  mockGoogle.signIn.mockResolvedValueOnce({ type: 'success', data: { idToken: 'google-id' } });
  await expect(providerToken('google')).resolves.toBe('google-id');
  expect(mockGoogle.configure).toHaveBeenCalledWith({ webClientId: 'web-client' });
  mockGoogle.signIn.mockResolvedValueOnce({ type: 'cancelled', data: null });
  await expect(providerToken('google')).resolves.toBeNull();
  mockGoogle.signIn.mockRejectedValueOnce({ code: 'SIGN_IN_CANCELLED' });
  await expect(providerToken('google')).resolves.toBeNull();
});
