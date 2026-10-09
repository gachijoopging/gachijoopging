import Constants from 'expo-constants';
import { createHttpClient, createMockClient, type ApiClient, type MockOptions } from './client';

const extra = Constants.expoConfig?.extra ?? {};

/** EXPO_PUBLIC_API_MODE=real 이고 주소가 있을 때만 실서버. 하나라도 빠지면 목으로 돈다 */
export const apiConfig = {
  real: process.env.EXPO_PUBLIC_API_MODE === 'real' && !!extra.apiBaseUrl,
  baseUrl: (extra.apiBaseUrl as string | undefined) ?? '',
  wsUrl: (extra.wsUrl as string | undefined) ?? '',
};

/** 화면은 이것만 부른다. 목/실을 모른다 */
export function createApiClient(options: MockOptions = {}): ApiClient {
  return apiConfig.real ? createHttpClient({ baseUrl: apiConfig.baseUrl }) : createMockClient(options);
}
