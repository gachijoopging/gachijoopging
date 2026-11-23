export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
export type MembershipStatus = 'NONE' | 'PENDING' | 'MEMBER';
export type PendingRequestState = 'pending' | 'confirming' | 'home' | 'rejected' | 'choice';

export function resolvePendingRequest(
  requestStatus: JoinRequestStatus | undefined,
  membershipStatus: MembershipStatus,
): PendingRequestState {
  if (membershipStatus === 'MEMBER') return 'home';
  if (requestStatus === 'APPROVED') return 'confirming';
  if (requestStatus === 'REJECTED') return 'rejected';
  if (requestStatus === 'PENDING') return 'pending';
  // 다른 기기에서 취소했거나 신청이 없다 — 1-9 에 빈 상태를 두지 않고 1-6 으로 간다
  return 'choice';
}
