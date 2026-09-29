import { File, Paths } from 'expo-file-system';
import { restore, type EndBody, type Op } from './outbox';
import type { Session } from './session';

/**
 * 계정 하나의 기기 기록. ended 는 종료 스냅샷 — 종료 요청이 큐에서 먼저 빠져도
 * 4-7 은 이 값으로 그리고, 재시도 때 새로 계산하지 않는다.
 */
export type Stored = { session: Session | null; ended: EndBody | null; outbox: Op[] };

const EMPTY: Stored = { session: null, ended: null, outbox: [] };
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
    return { session: raw.session ?? null, ended: raw.ended || null, outbox: restore(JSON.stringify(raw.outbox ?? [])) };
  } catch {
    return null;
  }
}

const read = (f: File) => (f.exists ? f.textSync() : null);

export function loadAccount(userId: string): Stored {
  if (account === userId) return state;
  account = userId;
  owner.write(userId);
  // 본 파일을 쓰다 죽었으면 임시 파일이 온전한 마지막 판이다
  state = parseStored(read(fileOf(userId))) ?? parseStored(read(fileOf(userId, '.tmp'))) ?? EMPTY;
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
  state = next;
  const text = JSON.stringify(next);
  const tmp = fileOf(account, '.tmp');
  tmp.write(text);
  fileOf(account).write(text);
  tmp.delete();
  listeners.forEach((l) => l(next));
  return next;
}

export function subscribe(listener: (s: Stored) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
