import Constants from 'expo-constants';
import { createHttpClient, createMockClient, type ApiClient, type ApiResponse, type MockOptions, type MutationKey } from './client';
import { MOCKS } from './mocks.generated';

const extra = Constants.expoConfig?.extra ?? {};

/** EXPO_PUBLIC_API_MODE=real 이고 주소가 있을 때만 실서버. 하나라도 빠지면 목으로 돈다 */
export const apiConfig = {
  real: process.env.EXPO_PUBLIC_API_MODE === 'real' && !!extra.apiBaseUrl,
  baseUrl: (extra.apiBaseUrl as string | undefined) ?? '',
  wsUrl: (extra.wsUrl as string | undefined) ?? '',
};

/**
 * 백엔드가 구현한 경로만 실서버로 보낸다. 경로가 생기면 한 줄 추가한다.
 * 서버가 아직 거절하는 경로(DELETE /users/me 의 405)도 넣는다 — 목의 성공은 계정이 남은 채 완료를 띄운다.
 */
const REAL_KEYS: ReadonlySet<MutationKey> = new Set<MutationKey>([
  'POST /auth/signup', 'POST /auth/login', 'POST /auth/kakao', 'POST /auth/google', 'POST /auth/refresh', 'POST /auth/logout',
  'POST /auth/password-reset', 'POST /auth/password-reset/confirm', 'PUT /users/me/social',
  'GET /users/me', 'PATCH /users/me', 'DELETE /users/me',
  'POST /crews', 'GET /crews', 'GET /crew', 'PATCH /crew', 'POST /crew/leave',
  'GET /crew/members', 'GET /crew/members/{userId}', 'DELETE /crew/members/{userId}', 'PUT /crew/leader',
  'POST /crews/join-requests', 'GET /crews/join-requests/mine', 'DELETE /crews/join-requests/mine',
  'POST /crews/join-requests/{requestId}/read', 'GET /crew/join-requests', 'POST /crew/join-requests/{requestId}',
  'POST /activities', 'GET /activities/current', 'POST /activities/{id}/pause', 'POST /activities/{id}/resume',
  'POST /activities/{id}/items', 'PATCH /activities/{id}/items/{itemId}', 'DELETE /activities/{id}/items/{itemId}',
  'POST /activities/{id}/end', 'GET /activities/{id}', 'DELETE /activities/{id}', 'GET /users/me/activities',
  'GET /crew/home',
]);

/** 프로필·크루·활동 사진만 서버에 올린다. 목 mediaId 는 UUID 가 아니라 실서버 PATCH 가 422 로 거절한다. 게시물 사진은 게시물 API 가 실서버로 갈 때 함께 옮긴다 */
const isRealUpload = (key: MutationKey, body: unknown) =>
  key === 'POST /media' && body instanceof FormData && ['PROFILE', 'CREW', 'ACTIVITY'].includes(String(body.getAll('purpose')[0]));

/** 화면은 이것만 부른다. 목/실을 모른다 */
export function createApiClient(options: MockOptions = {}): ApiClient {
  const mock = createMockClient(options);
  if (!apiConfig.real) return mock;
  const http = createHttpClient({ baseUrl: apiConfig.baseUrl });
  return {
    get(key, query) {
      // ponytail: 서버에 동의 API 가 없다. complete:false 를 주면 로그인마다 1-5 로 돌아간다. 항목은 미선택 그대로 둬야 1-4 가 동의를 받는다. 동의 API 가 생기면 REAL_KEYS 로 옮기고 지운다
      if (key === 'GET /users/me/agreements') return Promise.resolve({ data: { ...MOCKS['GET /users/me/agreements'].data, complete: true } } as unknown as ApiResponse<typeof key>);
      return REAL_KEYS.has(key) ? http.get(key, query) : mock.get(key, query);
    },
    mutate: (key, body) => (REAL_KEYS.has(key) || isRealUpload(key, body) ? http.mutate(key, body) : mock.mutate(key, body)),
  };
}
