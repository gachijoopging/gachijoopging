jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { apiBaseUrl: 'https://api.test/api/v1' } } } }));
jest.mock('expo-file-system', () => ({ Paths: { document: 'documents' }, File: class {
  get exists() { return false; }
  write() {}
  delete() {}
} }));
const mockSecure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockSecure.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => { mockSecure.set(k, v); },
  deleteItemAsync: async (k: string) => { mockSecure.delete(k); },
}));
import { createMockClient } from './client';
import { MOCKS } from './mocks.generated';

process.env.EXPO_PUBLIC_API_MODE = 'real';
const { apiConfig, createApiClient } = require('./config') as typeof import('./config');

const fetch = jest.fn(async (_url: string) => ({ ok: true, status: 200, text: async () => JSON.stringify({ data: { ok: true } }) }));
beforeEach(() => {
  fetch.mockClear();
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
});

test('실 모드에서 백엔드에 있는 경로는 실서버로 보낸다', async () => {
  expect(apiConfig.real).toBe(true);
  const api = createApiClient();
  await expect(api.get('GET /crews', { query: '줍' })).resolves.toEqual({ data: { ok: true } });
  await api.mutate('PUT /crew/leader', { userId: 'u2' });
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(['https://api.test/api/v1/crews?query=%EC%A4%8D', 'https://api.test/api/v1/crew/leader']);
});

test('실 모드에서도 백엔드에 없는 경로는 목 응답을 준다', async () => {
  const api = createApiClient();
  await expect(api.get('GET /crew/posts', { scope: 'CREW' })).resolves.toEqual(await createMockClient().get('GET /crew/posts', { scope: 'CREW' }));
  await expect(api.mutate('POST /activities', { id: 'a1' })).resolves.toBe(MOCKS['POST /activities']);
  expect(fetch).not.toHaveBeenCalled();
});

test('서버에 동의 API 가 없는 동안 동의는 완료로 본다 — 로그인마다 1-5 로 돌아가지 않게', async () => {
  const { data } = await createApiClient().get('GET /users/me/agreements');
  expect(data.complete).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});
