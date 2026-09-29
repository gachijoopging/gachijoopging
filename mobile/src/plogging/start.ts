import { ApiError, type Activity, type ApiClient } from '../api/client';
import { formatDistance, formatElapsed } from '../format';

/** 일시정지 중이면 pausedAt 에서 멈춘다 — pausedSec 만으로는 지금 멈춰 있는지 알 수 없다. */
export function activeSec(activity: Activity, now: number): number {
  const end = activity.paused && activity.pausedAt ? Date.parse(activity.pausedAt) : now;
  return Math.max(0, Math.floor((end - Date.parse(activity.startedAt)) / 1000) - activity.pausedSec);
}

export function activityMetrics(activity: Activity, now: number) {
  return [
    { value: formatDistance(activity.distanceM), label: '거리' },
    { value: formatElapsed(activeSec(activity, now)), label: '시간', muted: activity.paused },
    { value: `${activity.itemCount}개`, label: '줍기' },
  ];
}

export function activitySummaryLabel(activity: Activity, now: number): string {
  const distance = formatDistance(activity.distanceM).replace('km', '킬로미터').replace(/m$/, '미터');
  const paused = activity.paused ? ', 일시정지 중' : '';
  return `진행 중인 활동, ${distance}, ${formatElapsed(activeSec(activity, now))}, ${activity.itemCount}개${paused}`;
}

export type StartResult =
  | { kind: 'started'; id: string; startedAt: string; locationShared: boolean }
  | { kind: 'resumed'; id: string }
  | { kind: 'noCrew' }
  | { kind: 'failed' };

/**
 * 계약상 다른 UUID 의 진행 중 활동이 있으면 409 다. 다른 기기에서 시작한 경우라
 * 새로 만들지 않고 그 활동으로 이어간다.
 */

export async function startActivity(
  api: ApiClient,
  body: { id: string; startedAt: string; locationShared: boolean },
): Promise<StartResult> {
  try {
    const res = await api.mutate('POST /activities', body);
    return { kind: 'started', id: res.data.id, startedAt: body.startedAt, locationShared: body.locationShared };
  } catch (e) {
    if (e instanceof ApiError && e.code === 'NO_CREW') return { kind: 'noCrew' };
    if (!(e instanceof ApiError && e.code === 'CONFLICT')) return { kind: 'failed' };
  }
  try {
    const current = await api.get('GET /activities/current');
    return current.data ? { kind: 'resumed', id: current.data.id } : { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}
