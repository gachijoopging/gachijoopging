import { File, Paths } from 'expo-file-system';

/** since: 이 계정·소속이 시작된 시각. 같은 계정이라도 다시 로그인하거나 크루를 바꾸면 달라진다 */
type Account = { id: string; hasCrew: boolean; since?: number };
const file = new File(Paths.document, 'current-account.json');

export function currentAccount(): Account | null {
  try {
    const value = file.exists ? JSON.parse(file.textSync()) : null;
    return typeof value?.id === 'string' && typeof value.hasCrew === 'boolean' ? value : null;
  } catch { return null; }
}

let lastSince = 0;

export function rememberAccount(user: { id: string; membership: { status: string } }): Account {
  const hasCrew = user.membership.status === 'MEMBER';
  const before = currentAccount();
  const same = before?.id === user.id && before.hasCrew === hasCrew;
  const since = same && before.since != null ? before.since : (lastSince = Math.max(Date.now(), lastSince + 1));
  const account = { id: user.id, hasCrew, since };
  try { file.write(JSON.stringify(account)); } catch {}
  return account;
}

export function forgetAccount(): void {
  if (file.exists) file.delete();
}
