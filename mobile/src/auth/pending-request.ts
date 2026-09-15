export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
export type MembershipStatus = 'NONE' | 'PENDING' | 'MEMBER';
export type PendingRequestState = 'pending' | 'home' | 'rejected' | 'empty';

export function resolvePendingRequest(
  requestStatus: JoinRequestStatus | undefined,
  membershipStatus: MembershipStatus,
): PendingRequestState {
  if (requestStatus === 'APPROVED') return membershipStatus === 'MEMBER' ? 'home' : 'pending';
  if (requestStatus === 'REJECTED') return 'rejected';
  if (requestStatus === 'PENDING') return 'pending';
  return 'empty';
}
