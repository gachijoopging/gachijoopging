export const NOTICE_TITLE_MAX = 100;
export const NOTICE_BODY_MAX = 3000;

export type NoticeForm = { title: string; body: string };

export function noticeFormErrors(form: NoticeForm): Partial<Record<keyof NoticeForm, string>> {
  const errors: Partial<Record<keyof NoticeForm, string>> = {};
  const title = form.title.trim();
  const body = form.body.trim();
  if (!title) errors.title = '공지 제목을 입력해 주세요.';
  else if (title.length > NOTICE_TITLE_MAX) errors.title = '제목은 100자까지 입력할 수 있어요.';
  if (!body) errors.body = '공지 내용을 입력해 주세요.';
  else if (body.length > NOTICE_BODY_MAX) errors.body = '내용은 3000자까지 입력할 수 있어요.';
  return errors;
}

/** original 이 null 이면 작성. 보낼 수 없으면 null — 저장 버튼을 끈다 */
export function noticeSubmit(original: NoticeForm | null, form: NoticeForm): NoticeForm | null {
  if (Object.keys(noticeFormErrors(form)).length > 0) return null;
  const next = { title: form.title.trim(), body: form.body.trim() };
  if (original && next.title === original.title && next.body === original.body) return null;
  return next;
}

/** noticeId 가 null 이면 새 공지 작성 초안 */
export type NoticeDraftKey = { meId: string; crewId: string; noticeId: string | null };

// ponytail: 메모리에만 둔다. 앱을 다시 켜면 사라진다 — 재실행 뒤에도 필요하면 AsyncStorage 로 옮긴다
const drafts = new Map<string, NoticeForm>();
const draftKey = ({ meId, crewId, noticeId }: NoticeDraftKey) => `${meId}/${crewId}/${noticeId ?? 'new'}`;

export function noticeDraft(key: NoticeDraftKey): NoticeForm | null {
  return drafts.get(draftKey(key)) ?? null;
}

export function saveNoticeDraft(key: NoticeDraftKey, form: NoticeForm): void {
  drafts.set(draftKey(key), form);
}

export function clearNoticeDraft(key: NoticeDraftKey): void {
  drafts.delete(draftKey(key));
}
