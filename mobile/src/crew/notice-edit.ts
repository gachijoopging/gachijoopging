import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';

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

// 새 공지의 id 는 재실행 뒤에도 같아야 서버가 재전송을 흡수한다. 그래서 초안과 달리 파일에 둔다
const requestFile = ({ meId, crewId }: NoticeDraftKey) =>
  new File(Paths.document, `notice-request-${encodeURIComponent(meId)}-${encodeURIComponent(crewId)}.json`);

/** 같은 제목·내용으로 다시 올리면 지난번 id 를 돌려준다 */
export function noticeRequestId(key: NoticeDraftKey, submit: NoticeForm): string {
  const file = requestFile(key);
  let previous: { id?: unknown; title?: string; body?: string } | null = null;
  try { previous = file.exists ? JSON.parse(file.textSync()) : null; } catch {}
  const id = previous?.title === submit.title && previous.body === submit.body && typeof previous.id === 'string' ? previous.id : Crypto.randomUUID();
  file.write(JSON.stringify({ id, ...submit }));
  return id;
}

export function clearNoticeRequest(key: NoticeDraftKey): void {
  try { const file = requestFile(key); if (file.exists) file.delete(); } catch {}
}
