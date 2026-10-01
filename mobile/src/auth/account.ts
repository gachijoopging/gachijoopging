import { File, Paths } from 'expo-file-system';

type Account = { id: string; hasCrew: boolean };
const file = new File(Paths.document, 'current-account.json');

export function currentAccount(): Account | null {
  try {
    const value = file.exists ? JSON.parse(file.textSync()) : null;
    return typeof value?.id === 'string' && typeof value.hasCrew === 'boolean' ? value : null;
  } catch { return null; }
}

export function rememberAccount(user: { id: string; membership: { status: string } }): Account {
  const account = { id: user.id, hasCrew: user.membership.status === 'MEMBER' };
  try { file.write(JSON.stringify(account)); } catch {}
  return account;
}

export function forgetAccount(): void {
  if (file.exists) file.delete();
}
