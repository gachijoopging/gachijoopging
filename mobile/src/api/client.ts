import type { components, paths } from './contract.generated';
import { currentAccount, forgetAccount, rememberAccount } from '../auth/account';
import { ApiError, NetworkError, fromEnvelope } from './errors';
import { clearTokens, getTokens, setTokens, type TokenPair } from './tokens';

export type Activity = components['schemas']['Activity'];

type Method = 'get' | 'put' | 'post' | 'delete' | 'patch';
/** 계약(docs/openapi.yaml)에 있는 `METHOD /경로` */
type KeyOf<M extends Method> = {
  [P in keyof paths]: M extends unknown ? (paths[P][M] extends { responses: unknown } ? `${Uppercase<M>} ${P}` : never) : never;
}[keyof paths];
type JsonOf<R> = R extends { content: { 'application/json': infer B } } ? B : never;
/** 성공 응답의 JSON 본문. 본문이 없는 204 전용 경로는 never */
type ContractResponse<K> = K extends `${infer M} ${infer P extends keyof paths}`
  ? paths[P][Lowercase<M> & keyof paths[P]] extends { responses: infer R } ? JsonOf<R[Extract<keyof R, 200 | 201>]> : never
  : never;

export type QueryKey = KeyOf<'get'>;
export type ApiResponse<K extends QueryKey> =
  K extends 'GET /crew/export' ? { fileName: string; text: string } : ContractResponse<K>;

export type MutationKey = KeyOf<Method>;
export type MutationResponse<K extends MutationKey> =
  K extends QueryKey ? ApiResponse<K> : [ContractResponse<K>] extends [never] ? void : ContractResponse<K>;

export type ApiClient = {
  get<K extends QueryKey>(key: K, query?: unknown): Promise<ApiResponse<K>>;
  /** POST·PATCH 등 GET 이외의 요청. 키는 `METHOD /경로` 그대로다 */
  mutate<K extends MutationKey>(key: K, body?: unknown): Promise<MutationResponse<K>>;
};

export { ApiError, NetworkError, type ApiErrorField } from './errors';

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

/** 차단·신고 삭제처럼 대상이 어느 응답에 들어 있는지 알 수 없는 변경 뒤에 부른다 */
export function forgetAll(): void {
  lastResponses.clear();
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

/** load 를 보내기 직전의 계정·forget 을 기준으로 응답을 기억한다. 목 클라이언트도 이 입구로 실 클라이언트와 같은 기억 규칙을 쓴다 */
export async function getAndRemember<K extends QueryKey>(key: K, query: unknown, load: () => Promise<ApiResponse<K>>): Promise<ApiResponse<K>> {
  const owner = currentOwner();
  const sentAt = forgets;
  const response = await load();
  remember(owner, sentAt, key, query, response);
  return response;
}

const signOutListeners = new Set<() => void>();

/** 계정에 묶인 연결을 쥔 쪽이 로그아웃을 듣는다. 화면이 스택에 남아 있어도 이전 계정의 연결은 끊겨야 한다 */
export function onSignOut(listener: () => void): void {
  signOutListeners.add(listener);
}

/** 로그아웃 상태로. 남은 토큰·계정·기억한 응답이 다음 계정에 보이면 안 된다 */
export async function signOut(): Promise<void> {
  session += 1;
  lastResponses.clear();
  responsesOwner = null;
  forgetAccount();
  try {
    signOutListeners.forEach((listener) => listener());
  } finally {
    await clearTokens().catch(() => {});
  }
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
    if (response.headers?.get('content-type')?.startsWith('text/csv')) {
      const encoded = /filename\*=UTF-8''([^;]+)/i.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? '';
      return { fileName: decodeURIComponent(encoded), text };
    }
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

  async function get<K extends QueryKey>(key: K, query?: unknown): Promise<ApiResponse<K>> {
    const owner = currentOwner();
    const sentAt = forgets;
    const started = session;
    // 호출자는 응답을 받은 계정 기준으로 소속을 기억하고 이동하므로, 앞 세션의 응답은 성공이든 NO_CREW 같은 오류든 돌려주지 않는다
    const stale = () => new ApiError('TOKEN_EXPIRED', undefined, 401);
    let response: ApiResponse<K>;
    try {
      response = (await authed(key, query)) as ApiResponse<K>;
    } catch (error) {
      throw started === session ? error : stale();
    }
    if (started !== session) throw stale();
    // 보낸 뒤 이 기기에서 소속이 바뀌었으면(크루 나가기) 바뀌기 전 상태의 응답이다. 호출자가 다시 기억하면 소속이 되돌아가므로 버리고 다시 받는다
    if (key === 'GET /users/me' && owner !== currentOwner()) return get(key, query);
    remember(owner, sentAt, key, query, response);
    // 크루 생성·즉시 가입은 화면이 바로 기억하지만, 크루장의 승인처럼 서버에서 바뀐 소속은 내 정보를 받을 때만 알 수 있다.
    // 크루 없음으로 남으면 오프라인 재실행이 1-6 에 멈춰 활동 기록을 보내지 못한다
    if (key === 'GET /users/me') rememberAccount((response as ApiResponse<'GET /users/me'>).data);
    return response;
  }

  return {
    get,
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

