const mockFiles = new Map<string, string>();
jest.mock('expo-file-system', () => ({ Paths: { document: 'documents' }, File: class {
  name: string; constructor(_directory: string, name: string) { this.name = name; }
  get exists() { return mockFiles.has(this.name); }
  textSync() { return mockFiles.get(this.name); }
  write(value: string) { mockFiles.set(this.name, value); }
  delete() { mockFiles.delete(this.name); }
} }));
import { createMockClient, ApiError, forget, peek } from './client';
import { forgetAccount, rememberAccount } from '../auth/account';
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

