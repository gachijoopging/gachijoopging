import Constants from 'expo-constants';
import { createHttpClient, type ApiClient } from './client';

const extra = Constants.expoConfig?.extra ?? {};

export const apiConfig = {
  baseUrl: (extra.apiBaseUrl as string | undefined) ?? '',
  wsUrl: (extra.wsUrl as string | undefined) ?? '',
};

/** 화면은 이것만 부른다 */
export function createApiClient(): ApiClient {
  return createHttpClient({ baseUrl: apiConfig.baseUrl });
}
