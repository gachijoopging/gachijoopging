import { File, Paths } from 'expo-file-system';
import { restore, type Op } from './outbox';
import type { Session } from './session';

/** 계정 하나의 기기 기록. 끝난 활동도 큐가 비기 전까지는 session 이 남아 4-7 이 읽는다 */
export type Stored = { session: Session | null; ended: boolean; outbox: Op[] };

const EMPTY: Stored = { session: null, ended: false, outbox: [] };
// 배경 task 는 화면 없이 깨어나므로 어느 계정의 파일을 열지 이 파일로 안다
const owner = new File(Paths.document, 'activity-owner');

let account: string | null = null;
let state: Stored = EMPTY;
const listeners = new Set<(s: Stored) => void>();

const fileOf = (id: string, suffix = '') => new File(Paths.document, `activity-${id}.json${suffix}`);

export function parseStored(text: string | null): Stored | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text);
    if (typeof raw !== 'object' || raw == null) return null;
    return { session: raw.session ?? null, ended: !!raw.ended, outbox: restore(JSON.stringify(raw.outbox ?? [])) };
  } catch {
    return null;
  }
}

const read = (f: File) => (f.exists ? f.textSync() : null);

export function loadAccount(userId: string): Stored {
  if (account === userId) return state;
  owner.write(userId);
  // 본 파일을 쓰다 죽었으면 임시 파일이 온전한 마지막 판이다
  state = parseStored(read(fileOf(userId, '.tmp'))) ?? parseStored(read(fileOf(userId))) ?? EMPTY;
  account = userId;
  return state;
}

/** 화면 없이 깨어난 배경 task 용. 마지막으로 연 계정을 다시 연다 */
export function loadLastAccount(): Stored | null {
  if (account) return state;
  const id = read(owner);
  return id ? loadAccount(id.trim()) : null;
}

export const getStored = () => state;

export function updateStored(fn: (s: Stored) => Stored): Stored {
  if (!account) return state;
  const next = fn(state);
  if (next === state) return state;
  const text = JSON.stringify(next);
  const tmp = fileOf(account, '.tmp');
  if (tmp.exists) fileOf(account).write(JSON.stringify(state));
  tmp.write(text);
  // 임시 파일이 최신 기록이다. 본 파일 갱신 실패에도 재실행에서 복구한다.
  try {
    fileOf(account).write(text);
    tmp.delete();
  } catch {}
  state = next;
  listeners.forEach((l) => l(next));
  return next;
}

export function subscribe(listener: (s: Stored) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
