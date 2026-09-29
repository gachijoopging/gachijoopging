import { ApiError } from '../api/client';

export type ReportTargetType = 'USER' | 'POST' | 'COMMENT' | 'NOTICE_COMMENT' | 'CHAT_MESSAGE';
export type ReportReason = 'SPAM' | 'HATE' | 'INAPPROPRIATE_PHOTO' | 'PRIVACY' | 'OTHER';

export const REASONS: readonly { value: ReportReason; label: string }[] = [
  { value: 'SPAM', label: '스팸·도배' },
  { value: 'HATE', label: '혐오·욕설' },
  { value: 'INAPPROPRIATE_PHOTO', label: '부적절한 사진' },
  { value: 'PRIVACY', label: '사생활 침해' },
  { value: 'OTHER', label: '기타' },
];

export function reasonLabel(reason: string): string {
  return REASONS.find((r) => r.value === reason)?.label ?? '기타';
}

export const MEMO_MAX = 500;
const COUNTER_FROM = 400;

export function canSubmitReport(reason: ReportReason | null, memo: string): boolean {
  if (reason == null || memo.length > MEMO_MAX) return false;
  return reason !== 'OTHER' || memo.trim().length > 0;
}

export function memoCounter(memo: string): { text: string; full: boolean } | null {
  if (memo.length <= COUNTER_FROM) return null;
  return { text: `${memo.length}/${MEMO_MAX}`, full: memo.length >= MEMO_MAX };
}

export function submitOutcome(error: unknown): { kind: 'done' | 'duplicate' | 'failed'; message: string } {
  if (error == null) return { kind: 'done', message: '신고를 접수했어요' };
  if (error instanceof ApiError && error.code === 'CONFLICT') return { kind: 'duplicate', message: '이미 신고한 대상이에요.' };
  return { kind: 'failed', message: '신고를 접수하지 못했어요. 다시 시도해 주세요.' };
}

type Draft = { reason: ReportReason | null; memo: string; requestId: string | null };

// ponytail: 메모리에만 둔다. 앱을 다시 켜면 사라진다 — 재실행 뒤에도 필요하면 AsyncStorage 로 옮긴다
const drafts = new Map<string, Draft>();
const keyOf = (type: string, id: string) => `${type}:${id}`;

export function reportDraftFor(type: string, id: string): Draft {
  return drafts.get(keyOf(type, id)) ?? { reason: null, memo: '', requestId: null };
}

export function editReportDraft(type: string, id: string, next: { reason: ReportReason | null; memo: string }): void {
  const draft = reportDraftFor(type, id);
  // 입력이 바뀌면 다른 신고다. 옛 id 를 다시 쓰면 서버가 멱등 재전송으로 보고 새 사유를 버린다
  const same = draft.reason === next.reason && draft.memo === next.memo;
  drafts.set(keyOf(type, id), { ...next, requestId: same ? draft.requestId : null });
}

export function reportRequestId(type: string, id: string, makeId: () => string): string {
  const draft = reportDraftFor(type, id);
  const requestId = draft.requestId ?? makeId();
  drafts.set(keyOf(type, id), { ...draft, requestId });
  return requestId;
}

export function clearReportDraft(type: string, id: string): void {
  drafts.delete(keyOf(type, id));
}

const TARGET_LABEL: Record<ReportTargetType, string> = {
  POST: '게시물 신고',
  COMMENT: '댓글 신고',
  NOTICE_COMMENT: '공지 댓글 신고',
  CHAT_MESSAGE: '크루 채팅 신고',
  USER: '사용자 신고',
};

export function targetLabel(type: string): string {
  return TARGET_LABEL[type as ReportTargetType] ?? '신고';
}

export type ReportAction = 'DISMISS' | 'DELETE' | 'KICK';

/** 사용자 신고는 계정을 지우지 않는다 — 계약상 USER 에 DELETE 는 허용되지 않고 추방은 별도 요청이다 */
export function reportActions(type: string): ReportAction[] {
  return type === 'USER' ? ['DISMISS', 'KICK'] : ['DISMISS', 'DELETE'];
}

export function resolveOutcome(
  result: 'DISMISS' | 'DELETE',
  error: unknown,
): { removeRow: boolean; message: string | null; denied?: true } {
  if (error == null) return { removeRow: true, message: result === 'DISMISS' ? '신고를 기각했어요.' : '신고 대상을 삭제했어요.' };
  if (error instanceof ApiError && (error.code === 'NOT_FOUND' || error.code === 'CONFLICT')) {
    return { removeRow: true, message: '이미 처리된 신고예요.' };
  }
  if (error instanceof ApiError && error.code === 'FORBIDDEN') return { removeRow: false, message: null, denied: true };
  return { removeRow: false, message: '신고를 처리하지 못했어요. 다시 시도해 주세요.' };
}

/** 추방이 성공하면 서버가 그 사용자의 대기 중 USER 신고를 함께 완료한다. 재조회 전에 화면도 맞춘다 */
export function withoutKickedUser<T extends { targetType: string; targetId: string }>(reports: readonly T[], userId: string): T[] {
  return reports.filter((r) => !(r.targetType === 'USER' && r.targetId === userId));
}
