const mockFiles = new Map<string, string>();
jest.mock('expo-file-system', () => ({ Paths: { document: 'documents' }, File: class {
  name: string; constructor(_directory: string, name: string) { this.name = name; }
  get exists() { return mockFiles.has(this.name); }
  textSync() { return mockFiles.get(this.name); }
  write(value: string) { mockFiles.set(this.name, value); }
  delete() { mockFiles.delete(this.name); }
} }));
const mockSecure = new Map<string, string>();
/** 걸어 두면 SecureStore 쓰기가 풀릴 때까지 끝나지 않는다 */
let mockWriteGate: Promise<void> | null = null;
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockSecure.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => { await mockWriteGate; mockSecure.set(k, v); },
  deleteItemAsync: async (k: string) => { mockSecure.delete(k); },
}));
import { createMockClient, createHttpClient, ApiError, NetworkError, forget, peek } from './client';
import { currentAccount, forgetAccount, rememberAccount } from '../auth/account';
import { getTokens, setTokens } from './tokens';
import { MOCKS } from './mocks.generated';

describe('목 클라이언트', () => {
  test('재실행 뒤 종료 목도 기기에 남은 전체 합계를 사용한다', async () => {
    const session = { itemCount: 2, byCategory: { CAN: 2 }, distanceM: 100, pausedSec: 0 };
    const api = createMockClient({ activityTotals: () => session });
    const body = { id: 'a1', endedAt: '2026-09-30T00:01:00Z', durationSec: 60, pausedSec: 20, distanceM: 10, steps: null, route: [] };
    const response = await api.mutate('POST /activities/{id}/end', body);
    expect(response.data).toEqual(expect.objectContaining({ ...body, itemCount: 2, byCategory: { CAN: 2 } }));
  });

  test('openapi.yaml 의 example 을 그대로 돌려준다', async () => {
    const api = createMockClient();
    await expect(api.get('GET /crew/home')).resolves.toBe(MOCKS['GET /crew/home']);
  });

  test('피드 목은 scope 와 기간으로 거른다 — 전체 탭엔 나만 보기가 없고 내 게시물 탭엔 내 글만', async () => {
    const api = createMockClient();
    const ids = async (query: unknown) => (await api.get('GET /crew/posts', query)).data.items.map((p) => p.id);
    await expect(ids({ scope: 'CREW' })).resolves.toEqual(['po77']);
    await expect(ids({ scope: 'MINE' })).resolves.toEqual(['po78']);
    await expect(ids({ scope: 'CREW', from: '2026-09-01', to: '2026-09-05' })).resolves.toEqual([]);
    await expect(ids({ scope: 'MINE', from: '2026-09-05', to: '2026-09-05' })).resolves.toEqual(['po78']);
  });

  test('피드 기간은 KST 날짜로 비교한다 — UTC 15시 이후 글은 다음 날에 든다', async () => {
    const api = createMockClient();
    const items = MOCKS['GET /crew/posts'].data.items as unknown as { id: string; createdAt: string }[];
    const boundary = { ...items[0], id: 'po-boundary', createdAt: '2026-09-05T16:00:00Z' };
    items.push(boundary as (typeof items)[number]);
    try {
      const ids = async (query: unknown) => (await api.get('GET /crew/posts', query)).data.items.map((p) => p.id);
      await expect(ids({ scope: 'CREW', from: '2026-09-06', to: '2026-09-06' })).resolves.toContain('po-boundary');
      await expect(ids({ scope: 'CREW', from: '2026-09-05', to: '2026-09-05' })).resolves.not.toContain('po-boundary');
    } finally {
      items.pop();
    }
  });

  test('지정한 키는 실패시켜 오류 UI 를 확인할 수 있다', async () => {
    const api = createMockClient({ failing: ['GET /crew/home'] });
    await expect(api.get('GET /crew/home')).rejects.toBeInstanceOf(ApiError);
  });

  test('실패 지정이 없는 키는 영향받지 않는다', async () => {
    const api = createMockClient({ failing: ['GET /crew/home'] });
    await expect(api.get('GET /users/me')).resolves.toBeDefined();
  });

  test('지연을 주면 그만큼 늦게 온다', async () => {
    const api = createMockClient({ delayMs: 30 });
    const started = Date.now();
    await api.get('GET /users/me');
    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
  });

  test('mutate 는 example 이 있는 경로면 그 데이터를 돌려준다', async () => {
    const api = createMockClient();
    await expect(api.mutate('POST /auth/login', { email: 'a@b.com', password: 'password' })).resolves.toBe(
      MOCKS['POST /auth/login'],
    );
  });

  test('mutate 는 204 전용 경로(example 없음)면 값 없이 끝난다', async () => {
    const api = createMockClient();
    await expect(api.mutate('POST /auth/password-reset', { email: 'a@b.com' })).resolves.toBeUndefined();
  });

  test('mutate 도 지정한 키를 실패시킬 수 있다', async () => {
    const api = createMockClient({ failing: ['POST /auth/login'] });
    await expect(api.mutate('POST /auth/login', {})).rejects.toBeInstanceOf(ApiError);
  });
});

describe('마지막 응답 기억', () => {
  const member = (id: string) => ({ id, membership: { status: 'MEMBER' } });
  // 기억은 계정마다 따로다. 시험마다 새 계정으로 시작하면 앞 시험의 응답이 보이지 않는다
  let n = 0;
  let me = '';
  beforeEach(() => { me = `u${++n}`; rememberAccount(member(me)); });

  test('받은 응답을 같은 키·질의로 꺼낸다', async () => {
    const api = createMockClient();
    expect(peek('GET /crew/home')).toBeUndefined();
    const fresh = await api.get('GET /crew/home');
    expect(peek('GET /crew/home')).toEqual(fresh);
  });

  test('질의가 다르면 따로 기억한다', async () => {
    const api = createMockClient();
    const crew = await api.get('GET /crew/posts', { scope: 'CREW' });
    expect(peek('GET /crew/posts', { scope: 'MINE' })).toBeUndefined();
    const mine = await api.get('GET /crew/posts', { scope: 'MINE' });
    expect(peek('GET /crew/posts', { scope: 'CREW' })).toEqual(crew);
    expect(peek('GET /crew/posts', { scope: 'MINE' })).toEqual(mine);
  });

  test('받는 사이 계정이 바뀌면 그 응답은 새 계정 것으로 기억하지 않는다', async () => {
    const pending = createMockClient({ delayMs: 10 }).get('GET /crew/home');
    rememberAccount(member('next-account'));
    await pending;
    expect(peek('GET /crew/home')).toBeUndefined();
  });

  test('100개를 넘으면 가장 오래 안 본 응답부터 잊는다', async () => {
    const api = createMockClient();
    for (let i = 0; i <= 100; i++) await api.get('GET /posts/{postId}', { postId: `p${i}` });
    expect(peek('GET /posts/{postId}', { postId: 'p0' })).toBeUndefined();
    expect(peek('GET /posts/{postId}', { postId: 'p1' })).toBeDefined();
    expect(peek('GET /posts/{postId}', { postId: 'p100' })).toBeDefined();
  });

  test('실패한 요청은 기억하지 않는다', async () => {
    await createMockClient({ failing: ['GET /crew/home'] }).get('GET /crew/home').catch(() => {});
    expect(peek('GET /crew/home')).toBeUndefined();
  });

  test('로그아웃하면 비운다 — 다음 계정에 앞 계정 데이터가 보이면 안 된다', async () => {
    await createMockClient().get('GET /crew/home');
    forgetAccount();
    expect(peek('GET /crew/home')).toBeUndefined();
  });

  test('같은 계정을 다시 기억하면 남기고, 다른 계정을 거쳐 돌아오면 비어 있다', async () => {
    await createMockClient().get('GET /crew/home');
    rememberAccount(member(me));
    expect(peek('GET /crew/home')).toBeDefined();
    rememberAccount(member('someone-else'));
    expect(peek('GET /crew/home')).toBeUndefined();
    rememberAccount(member(me));
    expect(peek('GET /crew/home')).toBeUndefined();
  });

  test('크루를 나갔다 다른 크루에 들어가도 앞 크루 응답이 보이지 않는다', async () => {
    await createMockClient().get('GET /crew/home');
    rememberAccount({ id: me, membership: { status: 'NONE' } });
    rememberAccount(member(me));
    expect(peek('GET /crew/home')).toBeUndefined();
  });

  test('forget 전에 보낸 GET 이 늦게 와도 지운 응답을 되살리지 않는다', async () => {
    await createMockClient().get('GET /activities/{id}', { id: 'a100' });
    const late = createMockClient({ delayMs: 10 }).get('GET /activities/{id}', { id: 'a100' });
    forget('GET /activities/{id}', { id: 'a100' });
    await late;
    expect(peek('GET /activities/{id}', { id: 'a100' })).toBeUndefined();
  });

  test('로그아웃 전 로그인에서 보낸 GET 은 같은 계정으로 다시 로그인한 뒤 와도 기억하지 않는다', async () => {
    const late = createMockClient({ delayMs: 10 }).get('GET /crew/home');
    forgetAccount();
    await createMockClient().get('GET /users/me');
    rememberAccount(member(me));
    await late;
    expect(peek('GET /crew/home')).toBeUndefined();
  });

  test('forget 한 응답은 다시 꺼내지 않는다 — 삭제한 활동이 다시 보이면 안 된다', async () => {
    const api = createMockClient();
    await api.get('GET /activities/{id}', { id: 'a100' });
    await api.get('GET /crew/home');
    forget('GET /activities/{id}', { id: 'a100' });
    expect(peek('GET /activities/{id}', { id: 'a100' })).toBeUndefined();
    expect(peek('GET /crew/home')).toBeDefined();
  });
});

describe('실 API 클라이언트', () => {
  const BASE = 'https://api.test/api/v1';
  type Call = { url: string; method: string; headers: Record<string, string>; body?: unknown };
  const json = (status: number, body?: unknown) =>
    ({ ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) }) as Response;

  /** handler 가 돌려준 응답을 그대로 준다. 보낸 요청은 calls 에 쌓인다 */
  function server(handler: (call: Call) => Response | Promise<Response>) {
    const calls: Call[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
      const call = { url, method: init.method!, headers: init.headers as Record<string, string>, body: init.body };
      calls.push(call);
      return handler(call);
    }) as unknown as typeof globalThis.fetch;
    return { calls, api: createHttpClient({ baseUrl: BASE, fetch, timeoutMs: 50 }) };
  }
  const expired = () => json(401, { code: 'TOKEN_EXPIRED', message: 'expired', requestId: 'r1' });
  const isRefresh = (c: Call) => c.url.endsWith('/auth/refresh');
  const renewed = () => json(200, { data: { accessToken: 'new', refreshToken: 'r-new' } });

  beforeEach(async () => {
    mockSecure.clear();
    await setTokens({ accessToken: 'old', refreshToken: 'r-old' });
    rememberAccount({ id: 'u1', membership: { status: 'MEMBER' } });
  });

  test('경로 변수는 인자에서 채우고 GET 의 나머지는 쿼리, 그 밖은 JSON 본문으로 보낸다', async () => {
    const { calls, api } = server(() => json(200, { data: {} }));
    await api.get('GET /crew/members/{userId}/posts', { userId: 'u 9', cursor: 'c1', skip: undefined });
    await api.mutate('PATCH /notices/{noticeId}', { noticeId: 'n1', title: 't' });
    expect(calls[0].url).toBe(`${BASE}/crew/members/u%209/posts?cursor=c1`);
    expect(calls[0].headers.Authorization).toBe('Bearer old');
    expect(calls[1]).toEqual(expect.objectContaining({ url: `${BASE}/notices/n1`, method: 'PATCH', body: '{"title":"t"}' }));
  });

  test('내 정보를 받으면 기억한 소속을 맞춘다 — 크루를 만든 뒤 오프라인으로 재실행해도 1-6 에 멈추지 않는다', async () => {
    rememberAccount({ id: 'u1', membership: { status: 'NONE' } });
    const { api } = server(() => json(200, { data: { id: 'u1', membership: { status: 'MEMBER', crew: { id: 'c1', name: 'c', isLeader: true }, rejection: null } } }));
    await api.get('GET /users/me');
    expect(currentAccount()).toEqual(expect.objectContaining({ id: 'u1', hasCrew: true }));
  });

  test.each([
    ['로그아웃', null],
    ['다른 계정으로 로그인', 'u2'],
  ] as const)('내 정보를 기다리는 사이 %s 하면 늦게 온 앞 계정 응답은 호출자에게도 주지 않는다', async (_label, after) => {
    let answer!: (r: Response) => void;
    const { api } = server((c) => {
      if (c.url.endsWith('/users/me')) return new Promise<Response>((r) => { answer = r; });
      if (c.url.endsWith('/auth/logout')) return json(204);
      return json(200, { data: { accessToken: 'b', refreshToken: 'r-b' } });
    });
    const late = api.get('GET /users/me');
    await new Promise((r) => setTimeout(r, 0));
    if (after) {
      await api.mutate('POST /auth/login', { email: 'b@b.c', password: 'p' });
      rememberAccount({ id: after, membership: { status: 'NONE' } });
    } else await api.mutate('POST /auth/logout');
    answer(json(200, { data: { id: 'u1', membership: { status: 'MEMBER', crew: null, rejection: null } } }));
    await expect(late).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(currentAccount()?.id ?? null).toBe(after);
    if (after) expect(currentAccount()?.hasCrew).toBe(false);
  });

  test('내 정보를 기다리는 사이 크루를 나가면 늦게 온 소속은 버리고 다시 받는다', async () => {
    let answerFirst!: (r: Response) => void;
    let received = 0;
    const { calls, api } = server(() => {
      received += 1;
      if (received === 1) return new Promise<Response>((r) => { answerFirst = r; });
      return json(200, { data: { id: 'u1', membership: { status: 'NONE', crew: null, rejection: null } } });
    });
    const pending = api.get('GET /users/me');
    await new Promise((r) => setTimeout(r, 0));
    rememberAccount({ id: 'u1', membership: { status: 'NONE' } });
    answerFirst(json(200, { data: { id: 'u1', membership: { status: 'MEMBER', crew: { id: 'c1', name: 'c', isLeader: false }, rejection: null } } }));
    const result = await pending;
    expect(calls.filter((c) => c.url.endsWith('/users/me'))).toHaveLength(2);
    expect(result.data.membership.status).toBe('NONE');
    expect(currentAccount()).toEqual(expect.objectContaining({ id: 'u1', hasCrew: false }));
  });

  const noCrew = () => json(403, { code: 'NO_CREW', message: 'no crew', requestId: 'r1' });

  test.each([
    ['NO_CREW 오류', '로그아웃', null, noCrew],
    ['NO_CREW 오류', '다른 계정으로 로그인', 'u2', noCrew],
    ['성공', '로그아웃', null, () => json(200, { data: { memberCount: 3 } })],
    ['성공', '다른 계정으로 로그인', 'u2', () => json(200, { data: { memberCount: 3 } })],
  ] as const)('크루 GET 의 늦은 %s 응답이 %s 뒤에 오면 앞 세션 것이므로 TOKEN_EXPIRED 로 돌려준다', async (_kind, _change, after, reply) => {
    let answer!: (r: Response) => void;
    const { api } = server((c) => {
      if (c.url.endsWith('/crew')) return new Promise<Response>((r) => { answer = r; });
      if (c.url.endsWith('/auth/logout')) return json(204);
      return json(200, { data: { accessToken: 'b', refreshToken: 'r-b' } });
    });
    const late = api.get('GET /crew');
    await new Promise((r) => setTimeout(r, 0));
    if (after) {
      await api.mutate('POST /auth/login', { email: 'b@b.c', password: 'p' });
      rememberAccount({ id: after, membership: { status: 'NONE' } });
    } else await api.mutate('POST /auth/logout');
    answer(reply());
    await expect(late).rejects.toMatchObject({ code: 'TOKEN_EXPIRED', status: 401 });
    expect(currentAccount()?.id ?? null).toBe(after);
  });

  test('세션이 그대로면 NO_CREW 는 그대로 온다 — 호출자가 받아 소속대로 분기한다', async () => {
    const { api } = server(() => noCrew());
    await expect(api.get('GET /crew')).rejects.toMatchObject({ code: 'NO_CREW', status: 403 });
  });

  test('204 는 값 없이 끝난다', async () => {
    const { api } = server(() => json(204));
    await expect(api.mutate('DELETE /posts/{postId}', { postId: 'p1' })).resolves.toBeUndefined();
  });

  test('401 이면 refresh 하고 원요청을 새 토큰으로 한 번 다시 보낸다', async () => {
    const { calls, api } = server((c) => {
      if (isRefresh(c)) return renewed();
      return c.headers.Authorization === 'Bearer new' ? json(200, { data: { ok: 1 } }) : expired();
    });
    await expect(api.get('GET /crew/home')).resolves.toEqual({ data: { ok: 1 } });
    expect(calls.map((c) => c.url.replace(BASE, ''))).toEqual(['/crew/home', '/auth/refresh', '/crew/home']);
    expect(calls[1].body).toBe('{"refreshToken":"r-old"}');
    await expect(getTokens()).resolves.toEqual({ accessToken: 'new', refreshToken: 'r-new' });
  });

  test('재시도도 401 이면 더 돌지 않고 실패한다', async () => {
    const { calls, api } = server((c) => (isRefresh(c) ? renewed() : expired()));
    await expect(api.get('GET /crew/home')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(calls).toHaveLength(3);
  });

  test('refresh 가 거절되면 토큰·계정·기억한 응답을 지우고 로그아웃 상태가 된다', async () => {
    const { api } = server((c) => {
      if (isRefresh(c)) return expired();
      return c.url.endsWith('/users/me') ? json(200, { data: { id: 'u1', membership: { status: 'MEMBER' } } }) : expired();
    });
    await api.get('GET /users/me');
    expect(peek('GET /users/me')).toBeDefined();
    await expect(api.get('GET /crew/home')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    await expect(getTokens()).resolves.toBeNull();
    expect(currentAccount()).toBeNull();
    expect(peek('GET /users/me')).toBeUndefined();
  });

  test('refresh 중 연결이 끊기면 로그아웃하지 않는다', async () => {
    const { api } = server((c) => (isRefresh(c) ? Promise.reject(new TypeError('Network request failed')) : expired()));
    await expect(api.get('GET /crew/home')).rejects.toMatchObject({ code: 'OFFLINE' });
    await expect(getTokens()).resolves.toEqual({ accessToken: 'old', refreshToken: 'r-old' });
  });

  test('동시에 3개가 401 이어도 refresh 는 한 번만 나간다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const { calls, api } = server(async (c) => {
      if (isRefresh(c)) { await gate; return renewed(); }
      return c.headers.Authorization === 'Bearer new' ? json(200, { data: c.url }) : expired();
    });
    const all = Promise.all((['GET /crew/home', 'GET /crew', 'GET /crew/members'] as const).map((k) => api.get(k)));
    await new Promise((r) => setTimeout(r, 0));
    release();
    await all;
    expect(calls.filter(isRefresh)).toHaveLength(1);
    expect(calls).toHaveLength(7);
  });

  test('오류 봉투는 code·fields·requestId 를 담은 ApiError 가 된다. 봉투가 아니면 INTERNAL', async () => {
    const fields = [{ field: 'nickname', code: 'TAKEN' }];
    const { api } = server((c) => (c.url.endsWith('/users/me')
      ? json(422, { code: 'VALIDATION', message: 'bad', requestId: 'req-9', fields })
      : json(502, '<html>bad gateway</html>')));
    await expect(api.mutate('PATCH /users/me', { nickname: 'x' })).rejects.toEqual(
      expect.objectContaining({ code: 'VALIDATION', fields, status: 422, requestId: 'req-9' }),
    );
    const error = await api.get('GET /crew').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'INTERNAL', status: 502 });
    expect(error).not.toBeInstanceOf(NetworkError);
  });

  test('서버에 닿지 못하면 OFFLINE, 시간이 지나면 TIMEOUT 인 NetworkError', async () => {
    const offline = server(() => Promise.reject(new TypeError('Network request failed')));
    const error = await offline.api.get('GET /crew').catch((e) => e);
    expect(error).toBeInstanceOf(NetworkError);
    expect(error.code).toBe('OFFLINE');

    const hang = ((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal!.addEventListener('abort', () => reject(new Error('aborted')));
    })) as unknown as typeof fetch;
    const slow = createHttpClient({ baseUrl: BASE, timeoutMs: 10, fetch: hang });
    await expect(slow.get('GET /crew')).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  test('로그인은 받은 토큰을 저장하고, 로그아웃은 refreshToken 을 보낸 뒤 결과와 상관없이 비운다', async () => {
    const { calls, api } = server((c) => (c.url.endsWith('/auth/login')
      ? json(200, { data: { accessToken: 'a2', refreshToken: 'r2', isNew: false } })
      : json(409, { code: 'CONFLICT', message: 'x', requestId: 'r' })));
    await api.mutate('POST /auth/login', { email: 'a@b.c', password: 'p' });
    expect(calls[0].headers.Authorization).toBeUndefined();
    await expect(getTokens()).resolves.toEqual({ accessToken: 'a2', refreshToken: 'r2' });
    await expect(api.mutate('POST /auth/logout')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(calls[1].body).toBe('{"refreshToken":"r2"}');
    await expect(getTokens()).resolves.toBeNull();
  });

  test('refresh 를 기다리는 사이 로그아웃·재로그인했으면 늦게 온 결과가 새 세션을 건드리지 않는다', async () => {
    let answer!: (r: Response) => void;
    const { calls, api } = server((c) => {
      if (isRefresh(c)) return new Promise<Response>((r) => { answer = r; });
      if (c.url.endsWith('/auth/logout')) return json(204);
      if (c.url.endsWith('/auth/login')) return json(200, { data: { accessToken: 'b', refreshToken: 'r-b' } });
      return c.headers.Authorization === 'Bearer b' ? json(200, { data: {} }) : expired();
    });
    const stale = api.get('GET /crew/home').catch((e) => e);
    await new Promise((r) => setTimeout(r, 0));
    await api.mutate('POST /auth/logout');
    await api.mutate('POST /auth/login', { email: 'b@b.c', password: 'p' });
    answer(renewed());
    await expect(stale).resolves.toMatchObject({ code: 'TOKEN_EXPIRED' });
    await expect(getTokens()).resolves.toEqual({ accessToken: 'b', refreshToken: 'r-b' });
    expect(calls.filter((c) => c.url.endsWith('/crew/home'))).toHaveLength(1);

    const rejected = server((c) => {
      if (isRefresh(c)) return new Promise<Response>((r) => { answer = r; });
      return c.url.endsWith('/auth/login') ? json(200, { data: { accessToken: 'b', refreshToken: 'r-b' } }) : expired();
    });
    await setTokens({ accessToken: 'old', refreshToken: 'r-old' });
    const late = rejected.api.get('GET /crew/home').catch((e) => e);
    await new Promise((r) => setTimeout(r, 0));
    await rejected.api.mutate('POST /auth/login', { email: 'b@b.c', password: 'p' });
    answer(expired());
    await late;
    await expect(getTokens()).resolves.toEqual({ accessToken: 'b', refreshToken: 'r-b' });
  });

  test('refresh 가 끝난 뒤 옛 토큰의 401 이 늦게 와도 refresh 는 다시 나가지 않는다', async () => {
    let lateAnswer!: (r: Response) => void;
    const { calls, api } = server((c) => {
      if (isRefresh(c)) return renewed();
      if (c.headers.Authorization === 'Bearer new') return json(200, { data: c.url });
      if (c.url.endsWith('/crew')) return new Promise<Response>((r) => { lateAnswer = r; });
      return expired();
    });
    const late = api.get('GET /crew');
    await api.get('GET /crew/home');
    lateAnswer(expired());
    await expect(late).resolves.toEqual({ data: `${BASE}/crew` });
    expect(calls.filter(isRefresh)).toHaveLength(1);
  });

  test('로그아웃·탈퇴 응답이 다음 로그인 뒤에 와도 새 세션을 지우지 않는다', async () => {
    for (const key of ['POST /auth/logout', 'DELETE /users/me'] as const) {
      await setTokens({ accessToken: 'old', refreshToken: 'r-old' });
      let answer!: (r: Response) => void;
      const { api } = server((c) => (c.url.endsWith('/auth/login')
        ? json(200, { data: { accessToken: 'b', refreshToken: 'r-b' } })
        : new Promise<Response>((r) => { answer = r; })));
      const leaving = api.mutate(key);
      await new Promise((r) => setTimeout(r, 0));
      await api.mutate('POST /auth/login', { email: 'b@b.c', password: 'p' });
      rememberAccount({ id: 'u2', membership: { status: 'MEMBER' } });
      answer(json(204));
      await leaving;
      await expect(getTokens()).resolves.toEqual({ accessToken: 'b', refreshToken: 'r-b' });
      expect(currentAccount()?.id).toBe('u2');
    }
  });

  test('refresh 를 요청한 사이 다른 계정으로 로그인했으면 그 계정 토큰을 돌려주지 않는다', async () => {
    let release!: () => void;
    const { api } = server((c) => {
      if (isRefresh(c)) { mockWriteGate = new Promise((r) => { release = r; }); return renewed(); }
      return json(200, { data: { accessToken: 'b', refreshToken: 'r-b' } });
    });
    const refreshed = api.mutate('POST /auth/refresh').catch((e) => e);
    while (!mockWriteGate) await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const login = api.mutate('POST /auth/login', { email: 'b@b.c', password: 'p' });
    await new Promise((r) => setTimeout(r, 0));
    mockWriteGate = null;
    release();
    await login;
    await expect(refreshed).resolves.toMatchObject({ code: 'TOKEN_EXPIRED' });
    await expect(getTokens()).resolves.toEqual({ accessToken: 'b', refreshToken: 'r-b' });
  });

  test('탈퇴가 성공하면 로그아웃 상태가 되고, 실패하면 토큰을 그대로 둔다', async () => {
    const failing = server(() => json(409, { code: 'CONFLICT', message: 'x', requestId: 'r' }));
    await expect(failing.api.mutate('DELETE /users/me')).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(getTokens()).resolves.toEqual({ accessToken: 'old', refreshToken: 'r-old' });

    const ok = server(() => json(204));
    await ok.api.mutate('DELETE /users/me');
    await expect(getTokens()).resolves.toBeNull();
    expect(currentAccount()).toBeNull();
  });

  test('access 가 만료된 로그아웃은 refresh 로 바뀐 refreshToken 을 보낸다', async () => {
    const { calls, api } = server((c) => {
      if (isRefresh(c)) return renewed();
      return c.headers.Authorization === 'Bearer new' ? json(204) : expired();
    });
    await api.mutate('POST /auth/logout');
    expect(calls.map((c) => c.body)).toEqual(['{"refreshToken":"r-old"}', '{"refreshToken":"r-old"}', '{"refreshToken":"r-new"}']);
    await expect(getTokens()).resolves.toBeNull();
  });
});

