import type { ApiClient } from '../api/client';
export type MembershipStatus = 'NONE' | 'PENDING' | 'MEMBER';

/** docs/openapi.yaml 의 Me 스키마에서 분기에 쓰는 필드만 */
export type Me = {
  profileComplete: boolean;
  membership?: { status: MembershipStatus } | null;
};

export type Destination = '/nickname' | '/crew-choice' | '/pending-approval' | '/(tabs)';

export function resolveDestination(me: Me): Destination {
  if (!me.profileComplete) return '/nickname';

  switch (me.membership?.status) {
    case 'PENDING':
      return '/pending-approval';
    case 'MEMBER':
      return '/(tabs)';
    default:
      return '/crew-choice';
  }
}

export async function authenticatedDestination(api: ApiClient, me: Me): Promise<Destination> {
  if (!me.profileComplete) return '/nickname';
  const { data } = await api.get('GET /users/me/agreements');
  return data.complete ? resolveDestination(me) : '/nickname';
}
