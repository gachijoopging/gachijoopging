import { MOCKS, type MockKey } from './mocks.generated';
import type { MembershipStatus, Rejection } from '../auth/destination';
import type { JoinRequestStatus } from '../auth/pending-request';
import type { EndBody } from '../activity/outbox';
import type { AgreementDefinition, AgreementState } from '../auth/agreements';
import { currentAccount, forgetAccount } from '../auth/account';
import { ApiError, NetworkError, fromEnvelope } from './errors';
import { clearTokens, getTokens, setTokens, type TokenPair } from './tokens';
import { kstDate } from '../crew/calendar';

type MeData = (typeof MOCKS)['GET /users/me']['data'];
type JoinRequestData = (typeof MOCKS)['GET /crews/join-requests/mine']['data'];
/** docs/openapi.yaml 의 Activity 중 4-1 이 쓰는 필드. 목 example 은 리터럴이라 그대로 쓰면 타입이 좁다 */
export type Activity = {
  id: string;
  status: 'IN_PROGRESS' | 'ENDED';
  startedAt: string;
  pausedSec: number;
  paused: boolean;
  pausedAt: string | null;
  distanceM: number;
  itemCount: number;
  locationShared: boolean;
};
export type QueryKey = MockKey;
export type ApiResponse<K extends QueryKey> =
  K extends 'GET /agreements' ? { data: { items: readonly AgreementDefinition[] } } :
  K extends 'GET /users/me/agreements' ? { data: AgreementState } :
  K extends 'GET /users/me' ? { data: Omit<MeData, 'membership'> & {
    membership: { status: MembershipStatus; crew: MeData['membership']['crew'] | null; rejection: Rejection | null };
  } } : K extends 'GET /crews/join-requests/mine' ? {
    data: (Omit<JoinRequestData, 'status'> & { status: JoinRequestStatus }) | null;
  } : K extends 'GET /activities/current' ? { data: Activity | null } : K extends MockKey ? (typeof MOCKS)[K] : never;

/** 목에 example 이 없는 204 전용 경로. 성공해도 돌려줄 데이터가 없다 */
export type VoidMutationKey =
  | 'POST /auth/password-reset'
  | 'POST /auth/password-reset/confirm'
  | 'DELETE /crews/join-requests/mine'
  | 'POST /crews/join-requests/{requestId}/read'
  | 'POST /notifications/read'
  | 'DELETE /notices/{noticeId}'
  | 'DELETE /notice-comments/{commentId}'
  | 'POST /crew/join-requests/{requestId}'
  | 'PUT /crew/leader'
  | 'DELETE /crew/members/{userId}'
  | 'PATCH /notices/{noticeId}'
  | 'PUT /crew/chat/read'
  | 'POST /reports'
  | 'POST /crew/reports/{reportId}'
  | 'PUT /users/{userId}/block'
  | 'DELETE /users/{userId}/block'
  | 'PUT /users/{userId}/follow'
  | 'DELETE /users/{userId}/follow'
  | 'POST /crew/leave'
  | 'DELETE /users/me'
  | 'PUT /users/me/social'
  | 'POST /auth/logout'
  | 'PUT /posts/{postId}/like'
  | 'DELETE /posts/{postId}/like'
  | 'DELETE /posts/{postId}'
  | 'DELETE /comments/{commentId}'
  | 'POST /activities/{id}/pause'
  | 'POST /activities/{id}/resume'
  | 'POST /activities/{id}/live'
  | 'DELETE /activities/{id}/items/{itemId}'
  | 'DELETE /activities/{id}'
  | 'DELETE /media/{mediaId}';
export type MutationKey = QueryKey | VoidMutationKey;
/** 1-8 가입 응답. 공개 크루는 APPROVED, 비공개 크루는 PENDING 으로 온다 */
export type JoinResult = { id: string; crew: { id: string; name: string }; status: JoinRequestStatus };
export type MutationResponse<K extends MutationKey> =
  K extends 'PUT /users/me/agreements' ? { data: AgreementState } :
  K extends 'POST /crews/join-requests' ? { data: JoinResult } :
  K extends MockKey ? (typeof MOCKS)[K] : void;

export type ApiClient = {
  get<K extends QueryKey>(key: K, query?: unknown): Promise<ApiResponse<K>>;
  /** POST·PATCH 등 GET 이외의 요청. 키는 `METHOD /경로` 그대로다 */
  mutate<K extends MutationKey>(key: K, body?: unknown): Promise<MutationResponse<K>>;
};

export { ApiError, NetworkError, type ApiErrorField } from './errors';

export type MockOptions = {
  /** 응답 지연. 화면의 로딩 상태를 눈으로 보려면 올린다 */
  delayMs?: number;
  activityTotals?: () => { itemCount: number; byCategory: Record<string, number> } | null;
  /** 이 키들은 항상 실패한다. 오류·재시도 UI 를 목으로 확인하는 수단 */
  failing?: readonly MutationKey[];
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isMockKey(key: MutationKey): key is MockKey {
  return key in MOCKS;
}

type PostsQuery = { scope?: 'CREW' | 'MINE'; from?: string; to?: string };

/** 서버처럼 scope·기간을 적용한다. 전체 탭에는 나만 보기 글이 오지 않고, 내 게시물 탭에는 내 글만 온다 */
function filterPosts({ scope = 'CREW', from, to }: PostsQuery = {}) {
  const me = MOCKS['GET /users/me'].data.id;
  const posts = MOCKS['GET /crew/posts'].data;
  const items = posts.items.filter((post) => {
    const day = kstDate(post.createdAt);
    if (scope === 'MINE' ? post.author.id !== me : post.visibility === 'PRIVATE') return false;
    return !(from && day < from) && !(to && day > to);
  });
  return { data: { ...posts, items } };
}

/**
 * 다시 연 화면이 받아 오는 동안 로딩 대신 바로 그리려고, 키·질의별 마지막 응답을 기억한다.
 * 받은 계정·크루 소속·로그인과 지금이 다르면(로그아웃·재로그인·계정 전환·크루 탈퇴) 비운다 — 다른 계정·크루 데이터가 보이면 안 된다
 */
const lastResponses = new Map<string, unknown>();
let responsesOwner: string | null = null;
const responseKey = (key: QueryKey, query?: unknown) => `${key} ${JSON.stringify(query ?? null)}`;

function currentOwner(): string | null {
  const account = currentAccount();
  return account ? `${account.id}:${account.hasCrew}:${account.since ?? ''}` : null;
}

export function peek<K extends QueryKey>(key: K, query?: unknown): ApiResponse<K> | undefined {
  if (currentOwner() !== responsesOwner) {
    lastResponses.clear();
    return undefined;
  }
  return lastResponses.get(responseKey(key, query)) as ApiResponse<K> | undefined;
}

/** forget 이전에 보낸 GET 의 응답은 지운 것을 되살리므로 기억하지 않는다 */
let forgets = 0;

/** 삭제·차단처럼 기억한 응답이 틀려지는 변경 뒤에 부른다. 다시 열 때 지운 것이 보이면 안 된다 */
export function forget(key: QueryKey, query?: unknown): void {
  lastResponses.delete(responseKey(key, query));
  forgets += 1;
}

/** 활동 합계가 바뀌는 변경. 성공하면 합계를 담은 응답을 질의와 상관없이 잊는다 — 다시 연 5-3·5-5·홈이 이전 합계부터 그리면 안 된다 */
const ACTIVITY_WRITES: readonly MutationKey[] = [
  'POST /activities/{id}/items', 'PATCH /activities/{id}/items/{itemId}', 'DELETE /activities/{id}/items/{itemId}',
  'POST /activities/{id}/end', 'DELETE /activities/{id}',
];
const ACTIVITY_VIEWS: readonly QueryKey[] = [
  'GET /activities/{id}', 'GET /users/me/activities', 'GET /crew/members/{userId}/activities',
  'GET /crew/home', 'GET /users/me/stats', 'GET /crew/stats', 'GET /crew/calendar',
];

function forgetActivityViews() {
  for (const k of [...lastResponses.keys()]) {
    if (ACTIVITY_VIEWS.some((key) => k.startsWith(`${key} `))) lastResponses.delete(k);
  }
  forgets += 1;
}

const MAX_RESPONSES = 100;

/** owner·sentAt 은 요청을 보낼 때 값. 받는 사이 계정이 바뀌었거나 forget 이 있었으면 낡은 응답이므로 버린다 */
function remember(owner: string | null, sentAt: number, key: QueryKey, query: unknown, response: unknown) {
  if (owner !== currentOwner() || sentAt !== forgets) return;
  if (owner !== responsesOwner) {
    lastResponses.clear();
    responsesOwner = owner;
  }
  const k = responseKey(key, query);
  lastResponses.delete(k);
  lastResponses.set(k, response);
  if (lastResponses.size > MAX_RESPONSES) lastResponses.delete(lastResponses.keys().next().value!);
}

/** 실 API 가 붙기 전까지 화면이 쓰는 구현. */
export function createMockClient({ delayMs = 0, failing = [], activityTotals }: MockOptions = {}): ApiClient {
  let agreements: AgreementState | null = null;
  let agreementsOwner: string | null = null;
  const selectAgreementOwner = () => {
    const owner = currentAccount()?.id ?? null;
    if (agreementsOwner !== owner) { agreements = null; agreementsOwner = owner; }
  };
  async function load<K extends QueryKey>(key: K, query: unknown): Promise<ApiResponse<K>> {
    if (delayMs > 0) await wait(delayMs);
    if (failing.includes(key)) throw new ApiError('MOCK_FAILURE');
    if (key === 'GET /users/me/agreements') {
      selectAgreementOwner();
      if (agreements) return { data: agreements } as ApiResponse<K>;
    }
    if (key === 'GET /crew/posts') return filterPosts(query as PostsQuery) as unknown as ApiResponse<K>;
    return (MOCKS as unknown as Record<string, unknown>)[key] as ApiResponse<K>;
  }
  return {
    async get(key, query) {
      const owner = currentOwner();
      const sentAt = forgets;
      const response = await load(key, query);
      remember(owner, sentAt, key, query, response);
      return response;
    },
    async mutate(key, body) {
      if (delayMs > 0) await wait(delayMs);
      if (failing.includes(key)) throw new ApiError('MOCK_FAILURE');
      if (key === 'PUT /users/me/agreements') {
        selectAgreementOwner();
        const current = agreements ?? (MOCKS as unknown as Record<string, { data: AgreementState }>)['GET /users/me/agreements']?.data;
        if (!current) throw new ApiError('MOCK_FAILURE');
        const selected = (body as { items: { type: string; version: string; agreed: boolean }[] }).items;
        if (selected.some((choice) => !current.items.some((item) => item.type === choice.type && item.version === choice.version))) throw new ApiError('VALIDATION', [{ field: 'items', code: 'FORMAT' }]);
        const items = current.items.map((item) => {
          const choice = selected.find((value) => value.type === item.type);
          return choice ? { ...item, agreed: choice.agreed, agreedAt: choice.agreed ? new Date().toISOString() : null } : item;
        });
        agreements = { items, complete: items.every((item) => !item.required || item.agreed) };
        return { data: agreements } as never;
      }
      if (key === 'POST /activities') {
        // 목의 startedAt 은 고정값이라 그대로 쓰면 시작하자마자 24시간 기한이 지난 활동이 된다
        return { data: { ...MOCKS['POST /activities'].data, ...(body as object) } } as never;
      }
      if (key === 'POST /activities/{id}/end') {
        const request = body as EndBody & { id: string };
        const totals = activityTotals?.();
        return { data: { ...MOCKS['POST /activities/{id}/end'].data, ...request,
          ...(totals ? { itemCount: totals.itemCount, byCategory: totals.byCategory } : {}),
        } } as never;
      }
      // 204 전용 경로는 example 이 없다 — 성공은 그냥 값 없이 끝난다.
      return (isMockKey(key) ? MOCKS[key] : undefined) as never;
    },
  };
}

/** 로그아웃 상태로. 남은 토큰·계정·기억한 응답이 다음 계정에 보이면 안 된다 */
async function signOut(): Promise<void> {
  session += 1;
  lastResponses.clear();
  responsesOwner = null;
  forgetAccount();
  await clearTokens().catch(() => {});
}

export type HttpOptions = {
  /** 예 https://www.gachijoopging.site/api/v1 */
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/** 화면마다 클라이언트를 만들므로 refresh 는 모듈에 하나다. 동시에 401 이 나도 refresh 는 한 번만 나간다 */
let refreshing: Promise<void> | null = null;

/** 로그인·로그아웃마다 바뀐다. 이전 세션에서 시작한 refresh·재시도가 다음 계정의 토큰을 덮거나 지우면 안 된다 */
let session = 0;

/** 토큰을 내주는 경로. 성공하면 받은 토큰 쌍을 저장한다 */
const SIGN_IN_KEYS: readonly MutationKey[] = ['POST /auth/login', 'POST /auth/signup', 'POST /auth/kakao', 'POST /auth/google'];

export function createHttpClient({ baseUrl, fetch: send = (...args) => globalThis.fetch(...args), timeoutMs = 15_000 }: HttpOptions): ApiClient {
  async function call(key: MutationKey, args: unknown, token: string | null): Promise<unknown> {
    const [method, template] = key.split(' ');
    const isForm = typeof FormData !== 'undefined' && args instanceof FormData;
    const rest: Record<string, unknown> = isForm ? {} : { ...(args as object) };
    const path = template.replace(/\{(\w+)\}/g, (_, name: string) => {
      const value = rest[name];
      delete rest[name];
      return encodeURIComponent(String(value));
    });
    const query = method === 'GET'
      ? new URLSearchParams(Object.entries(rest).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString()
      : '';
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (isForm) body = args as FormData;
    else if (method !== 'GET' && Object.keys(rest).length > 0) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(rest);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await send(`${baseUrl}${path}${query ? `?${query}` : ''}`, { method, headers, body, signal: controller.signal });
    } catch {
      throw new NetworkError(controller.signal.aborted ? 'TIMEOUT' : 'OFFLINE');
    } finally {
      clearTimeout(timer);
    }
    const text = response.status === 204 ? '' : await response.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) throw fromEnvelope(response.status, json);
    return json ?? undefined;
  }

  function refresh(): Promise<void> {
    const started = session;
    refreshing ??= (async () => {
      const tokens = await getTokens();
      if (!tokens) throw new ApiError('TOKEN_EXPIRED', undefined, 401);
      const { data } = (await call('POST /auth/refresh', { refreshToken: tokens.refreshToken }, null)) as { data: TokenPair };
      if (started !== session) throw new ApiError('TOKEN_EXPIRED', undefined, 401);
      await setTokens(data);
    })()
      .catch(async (error) => {
        // 연결이 안 돼 못 바꾼 것은 로그아웃 사유가 아니다. 서버가 거절했을 때만 로그아웃
        if (error instanceof NetworkError) throw error;
        if (started === session) await signOut();
        throw new ApiError('TOKEN_EXPIRED', undefined, 401);
      })
      .finally(() => { refreshing = null; });
    return refreshing;
  }

  /** args 가 함수면 보낼 때마다 다시 만든다. refresh 로 바뀐 토큰을 본문에 담아야 하는 로그아웃용 */
  async function authed(key: MutationKey, args: unknown | (() => Promise<unknown>)): Promise<unknown> {
    const started = session;
    const payload = () => (typeof args === 'function' ? args() : args);
    const token = (await getTokens())?.accessToken ?? null;
    try {
      return await call(key, await payload(), token);
    } catch (error) {
      if (!token || !(error instanceof ApiError) || error.code !== 'TOKEN_EXPIRED') throw error;
      // 다른 요청이 이미 바꿔 놓았으면 refresh 없이 지금 토큰으로 다시 보낸다
      if ((await getTokens())?.accessToken === token) await refresh();
      const retry = await payload();
      const next = (await getTokens())?.accessToken ?? null;
      if (started !== session) throw error;
      return call(key, retry, next);
    }
  }

  return {
    async get(key, query) {
      const owner = currentOwner();
      const sentAt = forgets;
      const response = (await authed(key, query)) as ApiResponse<typeof key>;
      remember(owner, sentAt, key, query, response);
      return response;
    },
    async mutate(key, body) {
      // 응답을 기다리는 사이 다른 계정으로 로그인했으면 그 세션은 건드리지도 돌려주지도 않는다
      const started = session;
      if (key === 'POST /auth/refresh') {
        await refresh();
        const tokens = await getTokens();
        if (started !== session) throw new ApiError('TOKEN_EXPIRED', undefined, 401);
        return { data: tokens } as never;
      }
      if (key === 'POST /auth/logout') {
        try {
          return (await authed(key, async () => ({ ...(body as object), refreshToken: (await getTokens())?.refreshToken }))) as never;
        } finally {
          if (started === session) await signOut();
        }
      }
      if (key === 'DELETE /users/me') {
        await authed(key, body);
        if (started === session) await signOut();
        return undefined as never;
      }
      if (SIGN_IN_KEYS.includes(key)) {
        const response = (await call(key, body, null)) as { data: TokenPair };
        session += 1;
        await setTokens(response.data);
        return response as never;
      }
      const response = await authed(key, body);
      if (ACTIVITY_WRITES.includes(key)) forgetActivityViews();
      return response as never;
    },
  };
}

