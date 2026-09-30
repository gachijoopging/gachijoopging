import { MOCKS, type MockKey } from './mocks.generated';
import type { MembershipStatus } from '../auth/destination';
import type { JoinRequestStatus } from '../auth/pending-request';

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
export type ApiResponse<K extends MockKey> =
  K extends 'GET /users/me' ? { data: Omit<MeData, 'membership'> & {
    membership: { status: MembershipStatus; crew: MeData['membership']['crew'] | null };
  } } : K extends 'GET /crews/join-requests/mine' ? {
    data: (Omit<JoinRequestData, 'status'> & { status: JoinRequestStatus }) | null;
  } : K extends 'GET /activities/current' ? { data: Activity | null } : (typeof MOCKS)[K];

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
  | 'POST /activities/{id}/pause'
  | 'POST /activities/{id}/resume'
  | 'POST /activities/{id}/live'
  | 'DELETE /activities/{id}/items/{itemId}';
export type MutationKey = MockKey | VoidMutationKey;

export type ApiClient = {
  get<K extends MockKey>(key: K, query?: unknown): Promise<ApiResponse<K>>;
  /** POST·PATCH 등 GET 이외의 요청. 키는 `METHOD /경로` 그대로다 */
  mutate<K extends MutationKey>(key: K, body?: unknown): Promise<K extends MockKey ? (typeof MOCKS)[K] : void>;
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
  /** 이 키들은 항상 실패한다. 오류·재시도 UI 를 목으로 확인하는 수단 */
  failing?: readonly MutationKey[];
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isMockKey(key: MutationKey): key is MockKey {
  return key in MOCKS;
}

/** 실 API 가 붙기 전까지 화면이 쓰는 구현. 숫자는 docs/openapi.yaml 의 example 그대로다. */
export function createMockClient({ delayMs = 0, failing = [] }: MockOptions = {}): ApiClient {
  return {
    async get(key) {
      if (delayMs > 0) await wait(delayMs);
      if (failing.includes(key)) throw new ApiError('MOCK_FAILURE');
      return MOCKS[key] as ApiResponse<typeof key>;
    },
    async mutate(key) {
      if (delayMs > 0) await wait(delayMs);
      if (failing.includes(key)) throw new ApiError('MOCK_FAILURE');
      // 204 전용 경로는 example 이 없다 — 성공은 그냥 값 없이 끝난다.
      return (isMockKey(key) ? MOCKS[key] : undefined) as never;
    },
  };
}
