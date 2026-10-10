import { ApiError, createMockClient, type ApiClient, type ApiResponse, type JoinResult, type MockOptions } from './client';
import { MOCKS } from './mocks.generated';
import type { MembershipStatus, Rejection } from '../auth/destination';
import { CREW_CAPACITY } from '../crew/region';

type CrewSearchQuery = { query?: string; region?: string };

/** 서버처럼 이름 부분 일치(대소문자 무시)와 지역을 AND 로 건다 */
export function searchCrews({ query, region }: CrewSearchQuery = {}) {
  const page = MOCKS['GET /crews'].data;
  const q = query?.trim().toLowerCase();
  const items = page.items.filter((crew) => (!q || crew.name.toLowerCase().includes(q)) && (!region || crew.region === region));
  return { data: { ...page, items } };
}

export function createOnboardingMockClient(options: MockOptions = {}): ApiClient {
  const api = createMockClient(options);
  // ponytail: 목 상태는 프로세스 종료 때 초기화된다. 실 API 연결 시 서버 소속으로 복원한다.
  let membership: MembershipStatus = 'NONE';
  let crew: { id: string; name: string } | null = null;
  let request: JoinResult | null = null;
  let rejection: Rejection | null = null;
  let pendingChecks = 0;

  return {
    async get(key, query) {
      const response = await api.get(key, query);
      if (key === 'GET /users/me') {
        return { data: { ...MOCKS['GET /users/me'].data, membership: {
          status: membership,
          crew: membership === 'NONE' ? null : { ...crew, isLeader: false },
          rejection: membership === 'NONE' ? rejection : null,
        } } } as ApiResponse<typeof key>;
      }
      if (key === 'GET /crews/join-requests/mine') {
        // ponytail: 목 전용 — 대기 신청은 두 번째 확인 때 거절돼 1-9 거절 안내를 개발 빌드에서 볼 수 있다
        if (request?.status === 'PENDING' && ++pendingChecks >= 2) {
          request = { ...request, status: 'REJECTED' };
          rejection = { requestId: request.id, crew: request.crew, decidedAt: new Date().toISOString() };
          membership = 'NONE';
          crew = null;
        }
        return { data: request && { ...MOCKS['GET /crews/join-requests/mine'].data, ...request } } as ApiResponse<typeof key>;
      }
      if (key === 'GET /crews') return searchCrews(query as CrewSearchQuery) as unknown as ApiResponse<typeof key>;
      return response;
    },
    async mutate(key, body) {
      const response = await api.mutate(key, body);
      if (key === 'POST /crews') {
        if (membership === 'PENDING') throw new ApiError('JOIN_REQUEST_PENDING');
        membership = 'MEMBER';
        const { name } = body as { name: string };
        crew = { id: MOCKS['POST /crews'].data.id, name };
        return { data: { ...MOCKS['POST /crews'].data, ...(body as object) } } as typeof response;
      }
      if (key === 'POST /crews/join-requests') {
        if (membership === 'PENDING') throw new ApiError('JOIN_REQUEST_PENDING');
        const target = MOCKS['GET /crews'].data.items.find((c) => c.id === (body as { crewId: string }).crewId);
        if (!target) throw new ApiError('NOT_FOUND');
        if (target.memberCount >= CREW_CAPACITY) throw new ApiError('CREW_FULL');
        crew = { id: target.id, name: target.name };
        rejection = null;
        pendingChecks = 0;
        const open = target.joinPolicy === 'OPEN';
        membership = open ? 'MEMBER' : 'PENDING';
        request = { id: 'jr001', crew, status: open ? 'APPROVED' : 'PENDING' };
        return { data: request } as typeof response;
      }
      if (key === 'DELETE /crews/join-requests/mine') {
        membership = 'NONE';
        crew = null;
        request = request && { ...request, status: 'CANCELED' };
      }
      if (key === 'POST /crews/join-requests/{requestId}/read') rejection = null;
      return response;
    },
  };
}

export const onboardingApi = createOnboardingMockClient({ delayMs: 300 });
