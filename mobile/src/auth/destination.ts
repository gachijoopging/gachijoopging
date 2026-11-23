import type { ApiClient } from '../api/client';
export type MembershipStatus = 'NONE' | 'PENDING' | 'MEMBER';

/** docs/openapi.yaml 의 Me 스키마에서 분기에 쓰는 필드만 */
export type Me = {
  profileComplete: boolean;
  membership?: { status: MembershipStatus; rejection?: Rejection | null } | null;
};

/** 확인하지 않은 가장 최근 거절. status 가 NONE 일 때만 온다 */
export type Rejection = { requestId: string; crew: { id: string; name: string }; decidedAt: string };

export type Destination = '/nickname' | '/crew-choice' | '/pending-approval' | '/(tabs)';

export function resolveDestination(me: Me): Destination {
  if (!me.profileComplete) return '/nickname';

  switch (me.membership?.status) {
    case 'PENDING':
      return '/pending-approval';
    case 'MEMBER':
      return '/(tabs)';
    default:
      // 거절 안내는 [확인]을 받기 전까지 1-6 보다 먼저 보인다
      return me.membership?.rejection ? '/pending-approval' : '/crew-choice';
  }
}

export async function authenticatedDestination(api: ApiClient, me: Me): Promise<Destination> {
  if (!me.profileComplete) return '/nickname';
  const { data } = await api.get('GET /users/me/agreements');
  return data.complete ? resolveDestination(me) : '/nickname';
}
