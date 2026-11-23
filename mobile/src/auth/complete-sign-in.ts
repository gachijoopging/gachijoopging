import type { ApiClient } from '../api/client';
import { forgetAccount, rememberAccount } from './account';
import { authenticatedDestination } from './destination';
import { finishOnboarding, type OnboardingNavigation } from './navigation';

/**
 * 인증이 끝난 뒤의 공통 꼬리 — 내 정보 → 동의 상태 → 스택을 비우고 목적지로.
 * 여기서 실패하면 토큰은 살아 있으므로 호출자는 인증 요청이 아니라 이 함수만 다시 부른다.
 */
export async function completeSignIn(api: ApiClient, navigation: Pick<OnboardingNavigation, 'reset'>): Promise<void> {
  forgetAccount();
  const me = await api.get('GET /users/me');
  rememberAccount(me.data);
  finishOnboarding(navigation, await authenticatedDestination(api, me.data));
}
