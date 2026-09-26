export type JoinRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
export type MembershipStatus = 'NONE' | 'PENDING' | 'MEMBER';
export type PendingRequestState = 'pending' | 'confirming' | 'home' | 'rejected' | 'empty';

export function resolvePendingRequest(
  requestStatus: JoinRequestStatus | undefined,
  membershipStatus: MembershipStatus,
): PendingRequestState {
  if (membershipStatus === 'MEMBER') return 'home';
  if (requestStatus === 'APPROVED') return 'confirming';
  if (requestStatus === 'REJECTED') return 'rejected';
  if (requestStatus === 'PENDING') return 'pending';
  return 'empty';
}
