import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { currentAccount } from '../auth/account';

const empty: ReadonlySet<string> = new Set();
const accounts = new Map<string, ReadonlySet<string>>();
const listeners = new Set<() => void>();
const fileOf = (accountId: string) => new File(Paths.document, `blocked-users-${encodeURIComponent(accountId)}.json`);

export function blockedUsers(accountId: string | null | undefined): ReadonlySet<string> {
  if (!accountId) return empty;
  if (!accounts.has(accountId)) {
    let ids: string[] = [];
    try {
      const file = fileOf(accountId);
      const value = file.exists ? JSON.parse(file.textSync()) : [];
      if (Array.isArray(value)) ids = value.filter((id): id is string => typeof id === 'string');
    } catch {}
    accounts.set(accountId, new Set(ids));
  }
  return accounts.get(accountId)!;
}

function replace(accountId: string, next: ReadonlySet<string>): void {
  accounts.set(accountId, next);
  try { fileOf(accountId).write(JSON.stringify([...next])); } catch {}
  listeners.forEach((listener) => listener());
}

export function setUserBlocked(accountId: string, userId: string, blocked: boolean): void {
  const previous = blockedUsers(accountId);
  if (previous.has(userId) === blocked) return;
  const next = new Set(previous);
  if (blocked) next.add(userId); else next.delete(userId);
  replace(accountId, next);
}

export function reconcileBlockedUsers(accountId: string, ids: readonly string[], expected: ReadonlySet<string>, complete = true): void {
  if (blockedUsers(accountId) !== expected) return;
  replace(accountId, new Set(complete ? ids : [...expected, ...ids]));
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useBlockedUsers(accountId?: string | null): ReadonlySet<string> {
  const id = accountId ?? currentAccount()?.id;
  return useSyncExternalStore(subscribe, () => blockedUsers(id));
}
