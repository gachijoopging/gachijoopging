import { createMockClient, type ApiClient, type ApiResponse, type MockOptions } from './client';
import { MOCKS } from './mocks.generated';
import type { MembershipStatus } from '../auth/destination';

export function createOnboardingMockClient(options: MockOptions = {}): ApiClient {
  const api = createMockClient(options);
  // ponytail: 목 상태는 프로세스 종료 때 초기화된다. 실 API 연결 시 서버 소속으로 복원한다.
  let membership: MembershipStatus = 'NONE';
  let request: ApiResponse<'GET /crews/join-requests/mine'>['data'] = null;

  return {
    async get(key, query) {
      const response = await api.get(key, query);
      if (key === 'GET /users/me') {
        return { data: { ...MOCKS['GET /users/me'].data, membership: {
          status: membership,
          crew: membership === 'MEMBER' ? MOCKS['GET /users/me'].data.membership.crew : null,
        } } } as ApiResponse<typeof key>;
      }
      if (key === 'GET /crews/join-requests/mine') return { data: request } as ApiResponse<typeof key>;
      return response;
    },
    async mutate(key, body) {
      const response = await api.mutate(key, body);
      if (key === 'POST /crews') membership = 'MEMBER';
      if (key === 'POST /crews/join-requests') {
        membership = 'PENDING';
        request = MOCKS['POST /crews/join-requests'].data;
      }
      if (key === 'DELETE /crews/join-requests/mine') {
        membership = 'NONE';
        request = null;
      }
      return response;
    },
  };
}

export const onboardingApi = createOnboardingMockClient({ delayMs: 300 });
