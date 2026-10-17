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
 * 활동·미디어는 종료(POST /activities/{id}/end)가 생길 때 한꺼번에 넣는다 — 시작만 서버에 가면
 * 서버에 진행 중 활동이 남아 다음 시작·로그아웃·크루 나가기가 409 가 된다.
 */
const REAL_KEYS: ReadonlySet<MutationKey> = new Set<MutationKey>([
  'POST /auth/signup', 'POST /auth/login', 'POST /auth/kakao', 'POST /auth/google', 'POST /auth/refresh', 'POST /auth/logout',
  'POST /auth/password-reset', 'POST /auth/password-reset/confirm', 'PUT /users/me/social',
  'GET /users/me', 'PATCH /users/me',
  'POST /crews', 'GET /crews', 'GET /crew', 'PATCH /crew', 'POST /crew/leave',
  'GET /crew/members', 'GET /crew/members/{userId}', 'DELETE /crew/members/{userId}', 'PUT /crew/leader',
  'POST /crews/join-requests', 'GET /crews/join-requests/mine', 'DELETE /crews/join-requests/mine',
  'POST /crews/join-requests/{requestId}/read', 'GET /crew/join-requests', 'POST /crew/join-requests/{requestId}',
]);

/** 화면은 이것만 부른다. 목/실을 모른다 */
export function createApiClient(options: MockOptions = {}): ApiClient {
  const mock = createMockClient(options);
  if (!apiConfig.real) return mock;
  const http = createHttpClient({ baseUrl: apiConfig.baseUrl });
  return {
    get(key, query) {
      // ponytail: 서버에 동의 API 가 없다. 목 example(complete:false)을 그대로 주면 로그인마다 1-5 로 돌아간다. 동의 API 가 생기면 REAL_KEYS 로 옮기고 지운다
      if (key === 'GET /users/me/agreements') return Promise.resolve(MOCKS['PUT /users/me/agreements'] as ApiResponse<typeof key>);
      // ponytail: 서버에 홈 통계 API 가 없어 2-1 숫자는 목이다. 방금 가입한 크루와 다른 이름이 머리에 보이지 않게 크루만 실서버 값으로 바꾼다. 통계 API 가 생기면 REAL_KEYS 로 옮기고 지운다
      if (key === 'GET /crew/home') {
        return Promise.all([mock.get(key, query), http.get('GET /crew')])
          .then(([home, crew]) => ({ data: { ...home.data, crew: { id: crew.data.id, name: crew.data.name } } }) as ApiResponse<typeof key>);
      }
      return REAL_KEYS.has(key) ? http.get(key, query) : mock.get(key, query);
    },
    mutate: (key, body) => (REAL_KEYS.has(key) ? http.mutate(key, body) : mock.mutate(key, body)),
  };
}
