import Constants from 'expo-constants';
import { GoogleSignin, isCancelledResponse, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import { login as kakaoLogin } from '@react-native-seoul/kakao-login';
import { apiConfig } from '../api/config';

export type Provider = 'kakao' | 'google';

/** 계약의 provider 값. `PUT /users/me/social` 이 대문자로 받는다 */
export const PROVIDER_KEY: Record<Provider, 'KAKAO' | 'GOOGLE'> = { kakao: 'KAKAO', google: 'GOOGLE' };

/** 목 모드에서는 SDK 를 부르지 않는다 — 목 서버는 토큰을 검증하지 않고, 개발 빌드가 아니면 네이티브 모듈도 없다 */
const MOCK_TOKEN = 'mock-provider-token';

let googleConfigured = false;

/**
 * 제공자 SDK 로 서버에 넘길 토큰을 받는다. 사용자가 창을 닫았으면 null.
 * 카카오는 access token, 구글은 ID token 이다 — 백엔드가 각각 그것으로 검증한다(`KakaoAuthClient`·`GoogleAuthClient`)
 */
export async function providerToken(provider: Provider): Promise<string | null> {
  if (!apiConfig.real) return MOCK_TOKEN;
  return provider === 'kakao' ? kakaoToken() : googleToken();
}

async function kakaoToken(): Promise<string | null> {
  try {
    return (await kakaoLogin()).accessToken;
  } catch (error) {
    // 카카오 SDK 는 취소를 별도 코드 없이 메시지로만 알린다
    if (error instanceof Error && /cancel/i.test(error.message)) return null;
    throw error;
  }
}

async function googleToken(): Promise<string | null> {
  if (!googleConfigured) {
    // 웹 클라이언트 ID 여야 ID token 의 aud 가 백엔드 GOOGLE_CLIENT_ID 와 맞는다
    GoogleSignin.configure({ webClientId: Constants.expoConfig?.extra?.googleWebClientId as string | undefined });
    googleConfigured = true;
  }
  try {
    await GoogleSignin.hasPlayServices();
    // 이전 선택을 지워 매번 계정을 고르게 한다. 다른 구글 계정으로 연결하려는 사람이 막히지 않게
    await GoogleSignin.signOut().catch(() => {});
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) return null;
    if (!response.data.idToken) throw new Error('구글 ID token 이 없다. webClientId 설정을 확인한다');
    return response.data.idToken;
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) return null;
    throw error;
  }
}
