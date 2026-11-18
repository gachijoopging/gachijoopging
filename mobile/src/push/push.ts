import { useEffect } from 'react';
import { usePathname } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { apiConfig, createApiClient } from '../api/config';
import type { ApiClient } from '../api/client';
import { currentAccount } from '../auth/account';
import { askNotificationsOnce, NOTIFY_ASKED_FILE } from '../plogging/notify-permission';

const notifyAsked = new File(Paths.document, NOTIFY_ASKED_FILE);
let registered: string | null = null;

/** 로그인된 기기의 FCM 토큰을 서버에 등록한다. 등록을 못 해도 앱 사용은 막지 않고 다음 확인 때 다시 보낸다 */
export async function syncPushToken(api: ApiClient): Promise<void> {
  try {
    const account = currentAccount();
    if (!account) return;
    await askNotificationsOnce({
      get: Notifications.getPermissionsAsync,
      request: Notifications.requestPermissionsAsync,
      wasAsked: () => notifyAsked.exists,
      markAsked: () => notifyAsked.create({ overwrite: true }),
    });
    const { data: pushToken } = await Notifications.getDevicePushTokenAsync();
    const key = `${account.id}:${account.since}:${pushToken}`;
    if (key === registered) return;
    await api.mutate('PUT /users/me/devices', { pushToken, platform: 'ANDROID' });
    registered = key;
  } catch {}
}

/** 로그인·회원가입·콜드 스타트가 모두 화면 이동으로 끝나므로 경로가 바뀔 때마다 확인한다 */
export function usePushTokenSync(): void {
  const pathname = usePathname();
  useEffect(() => {
    if (apiConfig.real) void syncPushToken(createApiClient());
  }, [pathname]);
  useEffect(() => {
    if (!apiConfig.real) return;
    const sub = Notifications.addPushTokenListener(() => void syncPushToken(createApiClient()));
    return () => sub.remove();
  }, []);
}
