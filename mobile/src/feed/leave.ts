import { router } from 'expo-router';
import { createApiClient } from '../api/config';
import { resolveDestination } from '../auth/destination';

/** NO_CREW 403 — 추방·나가기 뒤라 소속 상태대로 1-6·1-9 로 보낸다 */
export async function leaveForMembership(): Promise<void> {
  try {
    const { data } = await createApiClient().get('GET /users/me');
    router.replace(resolveDestination(data));
  } catch {
    router.replace('/crew-choice');
  }
}
