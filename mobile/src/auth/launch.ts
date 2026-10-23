import { ApiError, type ApiClient } from '../api/client';
import { getTokens } from '../api/tokens';
import { currentAccount, rememberAccount } from './account';
import { authenticatedDestination, type Destination } from './destination';

/** 콜드 스타트 때 갈 곳. null 이면 지금 화면(홈)에 둔다 */
export async function launchDestination(api: ApiClient): Promise<Destination | '/start' | null> {
  if (!(await getTokens())) return '/start';
  try {
    const me = await api.get('GET /users/me');
    rememberAccount(me.data);
    return await authenticatedDestination(api, me.data);
  } catch (error) {
    // 연결이 안 되는 것은 로그아웃 사유가 아니다 — 오프라인에서도 활동을 시작·종료할 수 있어야 한다.
    // 서버가 세션을 거절했으면 클라이언트가 이미 토큰을 지웠다
    if (error instanceof ApiError && error.code === 'TOKEN_EXPIRED') return '/start';
    // 크루원이 아닌 것을 기억하고 있으면 탭을 열지 않는다. 승인 대기인지는 1-6 이 연결된 뒤 다시 묻는다
    return currentAccount()?.hasCrew === false ? '/crew-choice' : null;
  }
}
