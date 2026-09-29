export type MembershipStatus = 'NONE' | 'PENDING' | 'MEMBER';

/** docs/openapi.yaml 의 Me 스키마에서 분기에 쓰는 필드만 */
export type Me = {
  profileComplete: boolean;
  membership?: { status: MembershipStatus } | null;
};

export type Destination = '/nickname' | '/crew-choice' | '/pending-approval' | '/(tabs)';

/**
 * 1-1·1-2·1-4 가 공유하는 진입 분기. `profileComplete` 는 닉네임 설정 완료만 뜻하고
 * 필수 동의 완료를 뜻하지 않는다(화면 문서 미결) — 동의 완료를 조회하는 계약이 아직
 * 없어서 여기서는 소속 분기로 바로 넘어간다. 계약이 생기면 이 지점에 동의 확인을 끼운다.
 */
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
