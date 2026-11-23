import { router } from 'expo-router';
import { createApiClient } from '../api/config';
import { currentAccount, rememberAccount } from '../auth/account';
import { resolveDestination } from '../auth/destination';

/** NO_CREW 403 — 추방·나가기 뒤라 소속 상태대로 1-6·1-9 로 보낸다 */
export async function leaveForMembership(): Promise<void> {
  // 기억한 소속을 바꾸지 않으면 다른 크루에 들어갔을 때 이전 크루의 캐시를 먼저 그린다
  const account = currentAccount();
  if (account) rememberAccount({ id: account.id, membership: { status: 'NONE' } });
  try {
    const { data } = await createApiClient().get('GET /users/me');
    router.replace(resolveDestination(data));
  } catch {
    if (currentAccount()?.id !== account?.id) return;
    router.replace('/crew-choice');
  }
}
