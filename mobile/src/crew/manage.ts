import { ApiError } from '../api/client';

export type MemberAction = 'delegate' | 'kick';

type MenuInput = { meId: string; meIsLeader: boolean; member: { id: string; isLeader: boolean } };

export function memberMenu({ meId, meIsLeader, member }: MenuInput): MemberAction[] {
  return meIsLeader && !member.isLeader && member.id !== meId ? ['delegate', 'kick'] : [];
}

/** 다른 기기에서 먼저 처리돼 대상이 사라졌거나 상태가 바뀐 경우 */
function alreadyChanged(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'NOT_FOUND' || error.code === 'CONFLICT');
}

export type JoinDecision = 'APPROVE' | 'REJECT';

export function joinDecisionOutcome(
  decision: JoinDecision,
  nickname: string,
  error: unknown,
): { removeRow: boolean; message: string | null; denied?: true } {
  if (error == null) {
    return {
      removeRow: true,
      message: decision === 'APPROVE' ? `${nickname} 님을 크루원으로 맞이했어요.` : '가입 신청을 거절했어요.',
    };
  }
  if (alreadyChanged(error)) return { removeRow: true, message: '이미 처리된 가입 신청이에요.' };
  if (error instanceof ApiError && error.code === 'FORBIDDEN') return { removeRow: false, message: null, denied: true };
  return { removeRow: false, message: '가입 신청을 처리하지 못했어요. 다시 시도해 주세요.' };
}

export type MemberActionOutcome = {
  /** removeRow · reload: 목록과 역할을 다시 받는다(위임하면 내 역할이 바뀐다) · stay */
  next: 'removeRow' | 'reload' | 'stay';
  message: string | null;
};

export function memberActionOutcome(action: MemberAction, nickname: string, error: unknown): MemberActionOutcome {
  if (error == null) {
    return action === 'delegate'
      ? { next: 'reload', message: `${nickname} 님에게 크루장을 위임했어요.` }
      : { next: 'removeRow', message: `${nickname} 님을 추방했어요.` };
  }
  if (alreadyChanged(error)) return { next: 'reload', message: '크루원 정보가 바뀌었어요.' };
  if (error instanceof ApiError && error.code === 'FORBIDDEN') return { next: 'reload', message: null };
  return { next: 'stay', message: '크루원 관리를 처리하지 못했어요. 다시 시도해 주세요.' };
}
