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
import { ApiError, createMockClient } from './client';
import { MOCKS } from './mocks.generated';

process.env.EXPO_PUBLIC_API_MODE = 'real';
const { apiConfig, createApiClient } = require('./config') as typeof import('./config');

const ok = (data: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify({ data }) });
const fetch = jest.fn(async (_url: string, _init?: RequestInit) => ok({ ok: true }));
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
  await expect(api.get('GET /notifications')).resolves.toEqual(await createMockClient().get('GET /notifications'));
  await expect(api.mutate('POST /crew/notices', { title: '공지' })).resolves.toBe(MOCKS['POST /crew/notices']);
  expect(fetch).not.toHaveBeenCalled();
});

test('게시물·댓글·좋아요와 크루원 게시물은 실서버로 보낸다 — 목 ID 로는 상세가 열리지 않는다', async () => {
  const api = createApiClient();
  await api.get('GET /crew/posts', { scope: 'MINE' });
  await api.mutate('POST /crew/posts', { id: 'p1', text: '줍깅', visibility: 'CREW', mediaIds: [] });
  await api.get('GET /posts/{postId}', { postId: 'p1' });
  await api.mutate('PUT /posts/{postId}/like', { postId: 'p1' });
  await api.mutate('DELETE /posts/{postId}/like', { postId: 'p1' });
  await api.get('GET /posts/{postId}/comments', { postId: 'p1', cursor: 'c' });
  await api.mutate('POST /posts/{postId}/comments', { postId: 'p1', id: 'c1', text: '좋아요' });
  await api.mutate('DELETE /comments/{commentId}', { commentId: 'c1' });
  await api.mutate('DELETE /posts/{postId}', { postId: 'p1' });
  await api.get('GET /crew/members/{userId}/posts', { userId: 'u2', cursor: undefined });
  expect(fetch.mock.calls.map(([url, init]) => `${init?.method} ${url.replace('https://api.test/api/v1', '')}`)).toEqual([
    'GET /crew/posts?scope=MINE', 'POST /crew/posts', 'GET /posts/p1', 'PUT /posts/p1/like', 'DELETE /posts/p1/like',
    'GET /posts/p1/comments?cursor=c', 'POST /posts/p1/comments', 'DELETE /comments/c1', 'DELETE /posts/p1', 'GET /crew/members/u2/posts',
  ]);
});

test('활동은 시작부터 종료·기록까지 실서버로 보낸다 — 시작만 서버에 가면 진행 중 활동이 남아 다음 시작이 409 가 된다', async () => {
  const api = createApiClient();
  await api.mutate('POST /activities', { id: 'a1' });
  await api.get('GET /activities/current');
  await api.mutate('POST /activities/{id}/items', { id: 'a1', items: [] });
  await api.mutate('POST /activities/{id}/end', { id: 'a1' });
  await api.get('GET /users/me/activities');
  await api.mutate('DELETE /activities/{id}', { id: 'a1' });
  expect(fetch.mock.calls.map(([url, init]) => `${init?.method} ${url.replace('https://api.test/api/v1', '')}`)).toEqual([
    'POST /activities', 'GET /activities/current', 'POST /activities/a1/items', 'POST /activities/a1/end', 'GET /users/me/activities', 'DELETE /activities/a1',
  ]);
});

test('내 누적·크루 통계·달력·크루원 기록은 실서버 응답이다 — 목 ID 로는 상세가 422 로 열리지 않는다', async () => {
  const api = createApiClient();
  await api.get('GET /users/me/stats');
  await api.get('GET /crew/stats', { range: 'WEEK' });
  await api.get('GET /crew/calendar', { month: '2026-10' });
  await api.get('GET /crew/members/{userId}/activities', { userId: 'u2', cursor: undefined });
  expect(fetch.mock.calls.map(([url]) => url.replace('https://api.test/api/v1', ''))).toEqual([
    '/users/me/stats', '/crew/stats?range=WEEK', '/crew/calendar?month=2026-10', '/crew/members/u2/activities',
  ]);
});

test('버린 활동 사진 삭제는 실서버로 보낸다 — 목이 성공을 돌려주면 서버에 사진이 남은 채 대기열이 비워진다', async () => {
  await createApiClient().mutate('DELETE /media/{mediaId}', { mediaId: 'm1' });
  expect(fetch.mock.calls.map(([url, init]) => `${init?.method} ${url}`)).toEqual(['DELETE https://api.test/api/v1/media/m1']);
});

test('탈퇴는 실서버로 보낸다 — 목이 성공을 돌려주면 계정이 남은 채 탈퇴 완료가 뜬다', async () => {
  await createApiClient().mutate('DELETE /users/me');
  expect(fetch.mock.calls.map(([url, init]) => `${init?.method} ${url}`)).toEqual(['DELETE https://api.test/api/v1/users/me']);
});

test('프로필·크루·활동·게시물 사진은 실서버에 올린다 — 게시물 작성이 실서버라 목 mediaId 는 422 로 거절된다', async () => {
  const photo = (purpose: string) => {
    const body = new FormData();
    body.append('purpose', purpose);
    return body;
  };
  const api = createApiClient();
  for (const purpose of ['PROFILE', 'CREW', 'ACTIVITY', 'POST']) await api.mutate('POST /media', photo(purpose));
  expect(fetch).toHaveBeenCalledTimes(4);
});

test('홈은 통계까지 실서버 응답이다', async () => {
  await expect(createApiClient().get('GET /crew/home')).resolves.toEqual({ data: { ok: true } });
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(['https://api.test/api/v1/crew/home']);
});

test('크루가 없으면 홈은 NO_CREW 로 거절된다 — 홈이 소속 화면으로 다시 나눈다', async () => {
  fetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => JSON.stringify({ code: 'NO_CREW' }) });
  await expect(createApiClient().get('GET /crew/home')).rejects.toEqual(new ApiError('NO_CREW', undefined, 403));
});

test('서버에 동의 API 가 없는 동안 동의는 완료로 보되 항목은 미선택이다 — 1-4 필수 동의가 미리 체크되면 안 된다', async () => {
  const { data } = await createApiClient().get('GET /users/me/agreements');
  expect(data.complete).toBe(true);
  expect(data.items.map((item) => item.agreed)).toEqual([false, false, false]);
  expect(fetch).not.toHaveBeenCalled();
});
