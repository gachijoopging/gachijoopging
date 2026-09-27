type Draft = { text: string; requestId: string | null };

// ponytail: 메모리에만 둔다. 앱을 다시 켜면 사라진다 — 재실행 뒤에도 필요하면 AsyncStorage 로 옮긴다
const drafts = new Map<string, Draft>();

export function draftFor(noticeId: string): Draft {
  return drafts.get(noticeId) ?? { text: '', requestId: null };
}

export function editDraft(noticeId: string, text: string): void {
  const draft = draftFor(noticeId);
  // 글이 바뀌면 다른 댓글이다. 옛 id 를 다시 쓰면 서버가 중복으로 보고 새 글을 버린다
  drafts.set(noticeId, { text, requestId: text === draft.text ? draft.requestId : null });
}

export function requestIdFor(noticeId: string, makeId: () => string): string {
  const draft = draftFor(noticeId);
  const requestId = draft.requestId ?? makeId();
  drafts.set(noticeId, { ...draft, requestId });
  return requestId;
}

export function clearDraft(noticeId: string): void {
  drafts.delete(noticeId);
}
