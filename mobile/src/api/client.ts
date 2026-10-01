import { MOCKS, type MockKey } from './mocks.generated';
import type { MembershipStatus } from '../auth/destination';
import type { JoinRequestStatus } from '../auth/pending-request';
import type { EndBody } from '../activity/outbox';
import type { AgreementDefinition, AgreementState } from '../auth/agreements';
import { currentAccount } from '../auth/account';

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
    membership: { status: MembershipStatus; crew: MeData['membership']['crew'] | null };
  } } : K extends 'GET /crews/join-requests/mine' ? {
    data: (Omit<JoinRequestData, 'status'> & { status: JoinRequestStatus }) | null;
  } : K extends 'GET /activities/current' ? { data: Activity | null } : K extends MockKey ? (typeof MOCKS)[K] : never;

/** 목에 example 이 없는 204 전용 경로. 성공해도 돌려줄 데이터가 없다 */
export type VoidMutationKey =
  | 'POST /auth/password-reset'
  | 'POST /auth/password-reset/confirm'
  | 'DELETE /crews/join-requests/mine'
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
  | 'POST /auth/logout'
  | 'PUT /posts/{postId}/like'
  | 'DELETE /posts/{postId}/like'
  | 'DELETE /posts/{postId}'
  | 'DELETE /comments/{commentId}'
  | 'POST /activities/{id}/pause'
  | 'POST /activities/{id}/resume'
  | 'POST /activities/{id}/live'
  | 'DELETE /activities/{id}/items/{itemId}'
  | 'DELETE /activities/{id}';
export type MutationKey = QueryKey | VoidMutationKey;
export type MutationResponse<K extends MutationKey> = K extends 'PUT /users/me/agreements' ? { data: AgreementState } : K extends MockKey ? (typeof MOCKS)[K] : void;

export type ApiClient = {
  get<K extends QueryKey>(key: K, query?: unknown): Promise<ApiResponse<K>>;
  /** POST·PATCH 등 GET 이외의 요청. 키는 `METHOD /경로` 그대로다 */
  mutate<K extends MutationKey>(key: K, body?: unknown): Promise<MutationResponse<K>>;
};

export type ApiErrorField = { field: string; code: string };

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly fields?: readonly ApiErrorField[],
  ) {
    super(code);
  }
}

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

/** 실 API 가 붙기 전까지 화면이 쓰는 구현. */
export function createMockClient({ delayMs = 0, failing = [], activityTotals }: MockOptions = {}): ApiClient {
  let agreements: AgreementState | null = null;
  let agreementsOwner: string | null = null;
  const selectAgreementOwner = () => {
    const owner = currentAccount()?.id ?? null;
    if (agreementsOwner !== owner) { agreements = null; agreementsOwner = owner; }
  };
  return {
    async get(key) {
      if (delayMs > 0) await wait(delayMs);
      if (failing.includes(key)) throw new ApiError('MOCK_FAILURE');
      if (key === 'GET /users/me/agreements') {
        selectAgreementOwner();
        if (agreements) return { data: agreements } as ApiResponse<typeof key>;
      }
      return (MOCKS as unknown as Record<string, unknown>)[key] as ApiResponse<typeof key>;
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
