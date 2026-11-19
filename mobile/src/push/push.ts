import { useEffect, useRef } from 'react';
import { router, usePathname, type Href } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { apiConfig, createApiClient } from '../api/config';
import type { ApiClient } from '../api/client';
import { currentAccount } from '../auth/account';
import { resolveDestination } from '../auth/destination';
import { notificationDestination } from '../notifications/notifications';
import { askNotificationsOnce, NOTIFY_ASKED_FILE } from '../plogging/notify-permission';

const notifyAsked = new File(Paths.document, NOTIFY_ASKED_FILE);
let registered: string | null = null;
const opened = new Set<string>();

type PushData = Partial<Record<'notificationId' | 'type' | 'targetType' | 'targetId', string>>;

/** 로그인된 기기의 FCM 토큰을 서버에 등록한다. 등록을 못 해도 앱 사용은 막지 않고 다음 확인 때 다시 보낸다 */
export async function syncPushToken(api: ApiClient, token?: string): Promise<void> {
  try {
    const account = currentAccount();
    if (!account) return;
    await askNotificationsOnce({
      get: Notifications.getPermissionsAsync,
      request: Notifications.requestPermissionsAsync,
      wasAsked: () => notifyAsked.exists,
      markAsked: () => notifyAsked.create({ overwrite: true }),
    });
    // 토큰을 가져오면 토큰 리스너가 다시 불린다. 리스너가 넘긴 토큰이 있으면 가져오지 않는다
    const pushToken = token ?? (await Notifications.getDevicePushTokenAsync()).data;
    const key = `${account.id}:${account.since}:${pushToken}`;
    if (key === registered) return;
    registered = key;
    await api.mutate('PUT /users/me/devices', { pushToken, platform: 'ANDROID' }).catch((error) => {
      registered = null;
      throw error;
    });
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
    const sub = Notifications.addPushTokenListener(({ data }) => void syncPushToken(createApiClient(), data));
    return () => sub.remove();
  }, []);
}

/** 누른 푸시를 읽음 처리하고 대상 화면을 연다. 읽음이 실패해도 이동은 막지 않는다 */
export async function openPush(
  api: ApiClient,
  data: Record<string, unknown> | undefined,
  nav: { push(href: Href): void; dismissTo(href: Href): void },
  pathname: string,
): Promise<void> {
  try {
    const { notificationId, type = '', targetType = '', targetId } = (data ?? {}) as PushData;
    if (!notificationId || opened.has(notificationId)) return;
    opened.add(notificationId);
    api.mutate('POST /notifications/read', { ids: [Number(notificationId)] }).catch(() => {});
    if (targetType === 'CREW') {
      // 1-9 는 가입 결과 푸시를 받아 스스로 다시 읽는다
      if (pathname === '/pending-approval') return;
      const { data: me } = await api.get('GET /users/me');
      nav.dismissTo(resolveDestination(me));
      return;
    }
    nav.push(notificationDestination({ type, target: { type: targetType, id: targetId ?? null } }, null) ?? '/notifications');
  } catch {}
}

/**
 * 콜드 스타트 탭은 첫 화면(인증·온보딩)이 정해진 뒤, 탭에 남았을 때만 연다.
 * 로그인·온보딩·소속 화면으로 보냈으면 그 화면이 먼저다
 */
export function usePushOpen(settled: boolean, openLast: boolean): void {
  const pathname = usePathname();
  const path = useRef(pathname);
  path.current = pathname;
  useEffect(() => {
    if (!apiConfig.real || !settled) return;
    const open = (response: Notifications.NotificationResponse) =>
      void openPush(createApiClient(), response.notification.request.content.data, router, path.current);
    const last = openLast ? Notifications.getLastNotificationResponse() : null;
    if (last) open(last);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [settled, openLast]);
}
