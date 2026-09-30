import * as Location from 'expo-location';
import * as Network from 'expo-network';
import * as TaskManager from 'expo-task-manager';
import { updateTrackingNotification } from '../../modules/tracking-notification';
import { createMockClient, type ApiClient } from '../api/client';
import { flush, type Op } from './outbox';
import { applyFix, livePayload, trackingNotice } from './session';
import { getStored, loadLastAccount, updateStored } from './store';

export const TRACKING_TASK = 'gachi-activity-tracking';
const LIVE_EVERY_MS = 5_000;

// ponytail: 실 API·소켓(/app/crew/live)은 W3. 그 전까지 배경 보고 경로만 목으로 부른다
const api: ApiClient = createMockClient();

let lastLiveAt = 0;

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TRACKING_TASK, async ({ data, error }) => {
  if (error || !data) return;
  if (!loadLastAccount()?.session) return;
  updateStored((st) => {
    if (!st.session || st.ended) return st;
    const session = data.locations.reduce(
      (s, l) => applyFix(s, { latitude: l.coords.latitude, longitude: l.coords.longitude, accuracy: l.coords.accuracy, timestamp: l.timestamp }),
      st.session,
    );
    return { ...st, session };
  });
  tick(Date.now());
});

/** 5초마다 배경 알림 문구와 실시간 위치를 맞춘다. 화면의 1초 타이머와 위치 task 가 함께 부른다 */
export function tick(now: number) {
  const { session, ended } = getStored();
  if (!session || ended || now - lastLiveAt < LIVE_EVERY_MS) return;
  lastLiveAt = now;
  const { title, body } = trackingNotice(session, now);
  updateTrackingNotification(TRACKING_TASK, title, body, `gachijoopging://activity/${session.activityId}`);
  const { activityId, ...live } = livePayload(session, now);
  // 위치 전송은 쌓아 두지 않는다 — 마지막 값만 의미가 있다
  api.mutate('POST /activities/{id}/live', { id: activityId, ...live }).catch(() => {});
}

export async function startTracking(): Promise<boolean> {
  const { session } = getStored();
  if (!session) return false;
  try {
    // 이미 등록돼 있어도 다시 요청한다. 첫 등록이 앱이 앞에 오기 전에 되면 위치 task 만 남고
    // 포그라운드 서비스(알림·화면 꺼짐 추적)는 빠진다. 재등록은 그 서비스를 다시 올린다
    const { title, body } = trackingNotice(session, Date.now());
    await Location.startLocationUpdatesAsync(TRACKING_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1_000,
      distanceInterval: 0,
      foregroundService: { notificationTitle: title, notificationBody: body, killServiceOnDestroy: false },
    });
    return true;
  } catch (e) {
    // 왜 못 켰는지 삼키지 않는다 — 권한·포그라운드 규칙 위반은 여기서만 드러난다
    console.warn('[tracking] start failed', e instanceof Error ? e.message : String(e));
    return false;
  }
}

export async function stopTracking(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK)) await Location.stopLocationUpdatesAsync(TRACKING_TASK);
  } catch {
    // 이미 멈췄다
  }
}

function send(client: ApiClient, op: Op): Promise<unknown> {
  switch (op.kind) {
    case 'items':
      return client.mutate('POST /activities/{id}/items', { id: op.activityId, photoId: op.photoId, items: op.items });
    case 'deleteItem':
      return client.mutate('DELETE /activities/{id}/items/{itemId}', { id: op.activityId, itemId: op.itemId });
    case 'pause':
      return client.mutate('POST /activities/{id}/pause', { id: op.activityId });
    case 'resume':
      return client.mutate('POST /activities/{id}/resume', { id: op.activityId });
    case 'end':
      return client.mutate('POST /activities/{id}/end', { id: op.activityId, ...op.body });
  }
}

let syncing: Promise<boolean> | null = null;

/**
 * 큐를 순서대로 비운다. 동시에 두 번 돌지 않는다 — 같은 줍기를 두 번 보내지 않게.
 * 도는 동안 새로 쌓인 것도 이어서 보낸다. 다 보냈으면 true, 중간에 막히면 false
 */
export function syncOutbox(client: ApiClient = api): Promise<boolean> {
  syncing ??= (async () => {
    try {
      const net = await Network.getNetworkStateAsync().catch(() => null);
      // 연결이 없으면 요청마다 시간 초과를 기다리지 않고 바로 대기로 둔다
      if (net && (net.isConnected === false || net.isInternetReachable === false)) return false;
      for (;;) {
        const q = getStored().outbox;
        if (q.length === 0) return true;
        const sent = new Set<Op>();
        await flush(q, async (op) => {
          await send(client, op);
          sent.add(op);
        });
        // 보내는 동안 되돌려 바뀐 것은 남긴다 — 실제로 보낸 것만 뺀다
        if (sent.size) updateStored((st) => ({ ...st, outbox: st.outbox.filter((op) => !sent.has(op)) }));
        if (sent.size < q.length) return false;
      }
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}
