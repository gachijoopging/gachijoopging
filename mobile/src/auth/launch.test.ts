let mockAccountFile: string | null = null;
jest.mock('expo-file-system', () => ({ Paths: { document: 'documents' }, File: class {
  get exists() { return mockAccountFile != null; }
  textSync() { return mockAccountFile; }
  write(text: string) { mockAccountFile = text; }
  delete() { mockAccountFile = null; }
} }));
const mockSecure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockSecure.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => { mockSecure.set(k, v); },
  deleteItemAsync: async (k: string) => { mockSecure.delete(k); },
}));
import { ApiError, NetworkError, createHttpClient, type ApiClient } from '../api/client';
import { clearTokens, setTokens } from '../api/tokens';
import { currentAccount, rememberAccount } from './account';
import { launchDestination } from './launch';

const me = (membership: object) => ({ data: { id: 'u1', profileComplete: true, membership } });
function api(meResponse: () => Promise<unknown>): ApiClient {
  return {
    get: (async (key: string) => (key === 'GET /users/me' ? meResponse() : { data: { complete: true, items: [] } })) as ApiClient['get'],
    mutate: jest.fn() as unknown as ApiClient['mutate'],
  };
}

beforeEach(async () => {
  mockAccountFile = null;
  await setTokens({ accessToken: 'a', refreshToken: 'r' });
});

test('토큰이 없으면 1-1 로 보낸다', async () => {
  await clearTokens();
  await expect(launchDestination(api(async () => me({ status: 'MEMBER' })))).resolves.toBe('/start');
});

test('세션이 살아 있으면 소속으로 나눈다 — 재실행해도 거절 안내가 먼저 보인다', async () => {
  await expect(launchDestination(api(async () => me({ status: 'MEMBER', crew: { id: 'c1', name: 'c', isLeader: false } })))).resolves.toBe('/(tabs)');
  await expect(launchDestination(api(async () => me({ status: 'PENDING' })))).resolves.toBe('/pending-approval');
  const rejection = { requestId: 'j1', crew: { id: 'c1', name: 'c' }, decidedAt: '2026-10-17T00:00:00Z' };
  await expect(launchDestination(api(async () => me({ status: 'NONE', rejection })))).resolves.toBe('/pending-approval');
  await expect(launchDestination(api(async () => me({ status: 'NONE', rejection: null })))).resolves.toBe('/crew-choice');
});

test('오프라인이면 지금 화면에 두고, 서버가 세션을 거절하면 1-1 로 보낸다', async () => {
  await expect(launchDestination(api(async () => { throw new NetworkError('OFFLINE'); }))).resolves.toBeNull();
  await expect(launchDestination(api(async () => { throw new ApiError('TOKEN_EXPIRED', undefined, 401); }))).resolves.toBe('/start');
});

test.each([
  ['로그아웃', null],
  ['다른 계정으로 로그인', 'u2'],
] as const)('실제 클라이언트로 내 정보를 기다리는 사이 %s 하면 앞 계정을 기억하지 않고 1-1 로 보낸다', async (_label, after) => {
  const json = (status: number, body?: unknown) =>
    ({ ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) }) as Response;
  let answer!: (r: Response) => void;
  const fetch = (async (url: string) => {
    if (url.endsWith('/users/me')) return new Promise<Response>((r) => { answer = r; });
    if (url.endsWith('/users/me/agreements')) return json(200, { data: { complete: true, items: [] } });
    if (url.endsWith('/auth/logout')) return json(204);
    return json(200, { data: { accessToken: 'b', refreshToken: 'r-b' } });
  }) as unknown as typeof globalThis.fetch;
  const real = createHttpClient({ baseUrl: 'https://api.test/api/v1', fetch });
  const destination = launchDestination(real);
  await new Promise((r) => setTimeout(r, 0));
  if (after) {
    await real.mutate('POST /auth/login', { email: 'b@b.c', password: 'p' });
    rememberAccount({ id: after, membership: { status: 'NONE' } });
  } else await real.mutate('POST /auth/logout');
  answer(json(200, { data: { id: 'u1', profileComplete: true, membership: { status: 'MEMBER', crew: { id: 'c1', name: 'c', isLeader: false }, rejection: null } } }));
  await expect(destination).resolves.toBe('/start');
  expect(currentAccount()?.id ?? null).toBe(after);
  if (after) expect(currentAccount()?.hasCrew).toBe(false);
});

test('오프라인이어도 크루원이 아니었던 계정에는 탭을 열지 않는다', async () => {
  const offline = api(async () => { throw new NetworkError('OFFLINE'); });
  await launchDestination(api(async () => me({ status: 'PENDING' })));
  await expect(launchDestination(offline)).resolves.toBe('/crew-choice');
  await launchDestination(api(async () => me({ status: 'MEMBER', crew: { id: 'c1', name: 'c', isLeader: false } })));
  await expect(launchDestination(offline)).resolves.toBeNull();
});
