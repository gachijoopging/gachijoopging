import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { File } from 'expo-file-system';
import * as TaskManager from 'expo-task-manager';
import { updateTrackingNotification } from '../../modules/tracking-notification';
import { ApiError, type ApiClient } from '../api/client';
import { createApiClient } from '../api/config';
import { healthConnect } from './health-connect';
import { flush, type Op } from './outbox';
import { fixLogLine } from './fix-log';
import type { Fix } from './location-filter';
import { activityDeadline, applyFix, asOf, livePayload, trackingNotice } from './session';
import { readSteps, type StepSource } from './steps';
import { getStored, loadLastAccount, updateStored } from './store';

export const TRACKING_TASK = 'gachi-activity-tracking';
const LIVE_EVERY_MS = 5_000;

// ponytail: 실 API·소켓(/app/crew/live)은 W3. 그 전까지 배경 보고 경로만 목으로 부른다
const api: ApiClient = createApiClient({ activityTotals: () => getStored().session });

let lastLiveAt = 0;

// 실측 보행 빌드에서만 켠다. 릴리스 빌드의 내부 저장소는 adb 로 꺼낼 수 없어 앱 전용 외부 저장소에 남긴다.
// expo-file-system 은 외부 경로에 파일을 새로 만들지 못하므로 adb 로 미리 만들어 둔다(scripts/fixlog-to-fixture.mjs)
const fixLog = process.env.EXPO_PUBLIC_FIX_LOG === '1'
  ? new File('file:///storage/emulated/0/Android/data/site.gachijoopging.app/files/fixlog.txt')
  : null;

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TRACKING_TASK, async ({ data, error }) => {
  if (error || !data) return;
  if (!loadLastAccount()?.session) return;
  updateStored((st) => {
    if (!st.session || st.ended) return st;
    const fixes: Fix[] = data.locations.map((l) => ({ latitude: l.coords.latitude, longitude: l.coords.longitude, accuracy: l.coords.accuracy, timestamp: l.timestamp }));
    if (fixLog) {
      try { fixLog.write(fixes.map(fixLogLine).join(''), { append: true }); } catch (e) { console.warn('[tracking] fix log', e); }
    }
    const session = fixes.reduce(applyFix, st.session);
    return { ...st, session };
  });
  // 화면이 없어도 24시간이 되면 끝내고 추적을 끈다. actions 가 이 모듈을 가져다 쓰므로 순환을 피해 부를 때 가져온다
  const { endIfExpired } = require('./actions') as typeof import('./actions');
  if (await endIfExpired()) return;
  await tick(Date.now());
});

/** 5초마다 배경 알림 문구와 실시간 위치를 맞춘다. 화면의 1초 타이머와 위치 task 가 함께 부른다 */
export async function tick(now: number) {
  const { session, ended } = getStored();
  if (!session || ended || now - lastLiveAt < LIVE_EVERY_MS) return;
  lastLiveAt = now;
  const at = Math.min(now, activityDeadline(session));
  const shown = asOf(session, at);
  const { title, body } = trackingNotice(shown, at);
  updateTrackingNotification(TRACKING_TASK, title, body, `gachijoopging://activity/[id]?id=${session.activityId}`);
  const [permission, enabled] = await Promise.all([
    Location.getForegroundPermissionsAsync().catch(() => null),
    Location.hasServicesEnabledAsync().catch(() => false),
  ]);
  if (getStored().ended || getStored().session?.activityId !== session.activityId) return;
  const { activityId, ...live } = livePayload(shown, at);
  if (!permission?.granted || !enabled) live.location = null;
  // 위치 전송은 쌓아 두지 않는다 — 마지막 값만 의미가 있다
  await api.mutate('POST /activities/{id}/live', { id: activityId, ...live }).catch(() => {});
}

let readingSteps: Promise<void> | null = null;

/**
 * Health Connect 는 앱이 앞에 있을 때만 읽힌다. 화면을 끈 동안의 걸음은 시각 구간으로 다음 읽기에 함께 잡힌다.
 * ponytail: 삼성헬스가 Health Connect 에 늦게 쓰면 실제보다 적게 읽혀 거리 보정이 과하게 걸릴 수 있다. 실기기 지연을 재고 신뢰 조건을 둔다
 */
export async function refreshSteps(now: number, source: StepSource = healthConnect): Promise<void> {
  const before = getStored().session;
  if (!before || getStored().ended || readingSteps) return;
  readingSteps = (async () => {
    // 못 읽으면 앞서 잰 값도 버린다. 권한을 거둔 뒤 낡은 걸음으로 거리를 계속 줄이면 안 된다
    const at = Math.min(now, activityDeadline(before));
    const steps = await readSteps(asOf(before, at), at, source);
    updateStored((st) => (st.session?.activityId === before.activityId && !st.ended ? { ...st, session: { ...st.session, steps } } : st));
  })();
  try {
    await readingSteps;
  } finally {
    readingSteps = null;
  }
}

/** 종료 직전. 진행 중인 읽기를 기다린 뒤 지금까지 한 번 더 읽는다. 앞선 읽기가 지금 읽기를 건너뛰게 두면 마지막 걸음이 빠진다 */
export async function finalSteps(source: StepSource = healthConnect): Promise<void> {
  while (readingSteps) await readingSteps.catch(() => {});
  await refreshSteps(Date.now(), source);
}

export async function startTracking(): Promise<boolean> {
  const { session, ended } = getStored();
  if (!session || ended) return false;
  try {
    const { title, body } = trackingNotice(session, Date.now());
    await Location.startLocationUpdatesAsync(TRACKING_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      // expo-location 은 앱이 앞에 있으면 위치마다 메인 스레드에서 JobScheduler 에 작업을 건다.
      // 1초 간격이면 Android 16 에서 이 호출이 밀려 ANR(TaskJobService 20초 초과)이 났다.
      // 소켓은 5초, GPS 상태 판단은 10초 기준이라 3초면 충분하다
      timeInterval: 3_000,
      distanceInterval: 0,
      foregroundService: { notificationTitle: title, notificationBody: body, killServiceOnDestroy: false },
    });
    return true;
  } catch (e) {
    console.warn('[tracking] start failed', e instanceof Error ? e.message : String(e));
    return false;
  }
}

// 시작 여부를 먼저 기다리면 그 사이 시작된 다른 계정의 추적까지 끈다
export async function stopTracking(): Promise<void> {
  try {
    await Location.stopLocationUpdatesAsync(TRACKING_TASK);
  } catch {
    // 이미 멈췄다
  }
}

async function send(client: ApiClient, op: Op): Promise<unknown> {
  switch (op.kind) {
    case 'items':
      return client.mutate('POST /activities/{id}/items', { id: op.activityId, photoId: op.photoId, items: op.items });
    case 'deleteItem':
      return client.mutate('DELETE /activities/{id}/items/{itemId}', { id: op.activityId, itemId: op.itemId });
    case 'discardPhoto':
      try {
        await client.mutate('DELETE /media/{mediaId}', { mediaId: op.mediaId });
      } catch (error) {
        // 정리 작업이 종료를 막으면 안 된다. 403·409 는 다시 보내도 같고, 404 는 이 경로가 아직 없는 이전 서버가 낸다(계약상 없는 사진은 204).
        // 밖으로 내보내면 큐가 멈추고 활동이 사라졌다는 표시가 뜬다
        if (!(error instanceof ApiError) || !['FORBIDDEN', 'CONFLICT', 'NOT_FOUND'].includes(error.code)) throw error;
      }
      return;
    case 'pause':
      return client.mutate('POST /activities/{id}/pause', { id: op.activityId });
    case 'resume':
      return client.mutate('POST /activities/{id}/resume', { id: op.activityId });
    case 'end':
      try {
        const response = await client.mutate('POST /activities/{id}/end', { id: op.activityId, ...op.body });
        applyEndedActivity(op.activityId, response.data);
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'CONFLICT') throw error;
        const response = await client.get('GET /activities/{id}', { id: op.activityId });
        if (response.data.status !== 'ENDED' || response.data.id !== op.activityId || response.data.itemCount !== getStored().session?.itemCount) throw error;
        applyEndedActivity(op.activityId, response.data);
      }
      return;
  }
}

export function applyEndedActivity(id: string, data: { id: string; status: string; endedAt: string | null; durationSec: number; pausedSec: number; distanceM: number; steps: number | null; route?: readonly (readonly number[])[] | null; itemCount: number; byCategory: Readonly<Record<string, number>> }) {
  const { endedAt } = data;
  if (data.id !== id || data.status !== 'ENDED' || endedAt == null) throw new Error('종료 응답이 활동과 일치하지 않아요');
  updateStored((st) => st.session?.activityId === id ? {
    ...st,
    ended: { endedAt, durationSec: data.durationSec, pausedSec: data.pausedSec, distanceM: data.distanceM, steps: data.steps, route: data.route?.map((p) => [...p]) ?? (typeof st.ended === 'object' ? st.ended?.route : null) ?? [] },
    session: { ...st.session, itemCount: data.itemCount, byCategory: data.byCategory, distanceM: data.distanceM, steps: data.steps },
  } : st);
}

let syncing: Promise<boolean> | null = null;
let sending: Op | null = null;
let lastError: string | null = null;

export const isSendingItem = (id: string) => sending?.kind === 'items' && sending.items.some((item) => item.id === id);

/** 활동이 서버에서 사라졌거나 내 것이 아니라는 응답. 재시도로는 풀리지 않으므로 화면이 이유를 보여야 한다 */
export const GONE_CODES = ['NOT_FOUND', 'FORBIDDEN', 'NO_CREW'] as const;
export const activityGoneCode = (): (typeof GONE_CODES)[number] | null =>
  (GONE_CODES as readonly string[]).includes(lastError ?? '') ? (lastError as (typeof GONE_CODES)[number]) : null;

/** 큐를 순서대로 비운다. 동시에 두 번 돌지 않는다 — 같은 줍기를 두 번 보내지 않게 */
export function syncOutbox(client: ApiClient = api): Promise<boolean> {
  syncing ??= Promise.resolve().then(async () => {
    try {
      const net = await Network.getNetworkStateAsync().catch(() => null);
      if (net && (net.isConnected === false || net.isInternetReachable === false)) return false;
      while (getStored().outbox.length) {
        const remaining = await flush([getStored().outbox[0]], async (op) => {
          sending = op;
          try {
            await send(client, op);
            lastError = null;
          } catch (error) {
            lastError = error instanceof ApiError ? error.code : 'UNKNOWN';
            throw error;
          } finally {
            sending = null;
          }
          updateStored((st) => ({ ...st, outbox: st.outbox.filter((queued) => queued !== op) }));
        });
        if (remaining.length) return false;
      }
      return true;
    } finally {
      syncing = null;
    }
  });
  return syncing;
}
