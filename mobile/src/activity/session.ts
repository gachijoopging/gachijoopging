import type { LatLng } from '../../modules/kakao-map';
import type { Activity } from '../api/client';
import { formatClock, formatDistance } from '../format';
import type { Category } from '../category';
import { applyPickup, undoPickup, type Counts } from './pickup';
import { correctDistance, distanceM, filterFix, initialFilterState, type FilterState, type Fix } from './location-filter';

const SEARCH_AFTER_MS = 10_000;
const UNSTABLE_AFTER_MS = 15_000;

/** 4-3 이 기기에 쥐고 있는 활동. 계정별로 디스크에 남아 재실행·배경에서도 이어진다 */
export type Session = {
  activityId: string;
  userId: string;
  startedAt: string;
  pausedSec: number;
  paused: boolean;
  pausedAt: string | null;
  locationShared: boolean;
  itemCount: number;
  byCategory: Counts;
  /** 재개할 때마다 새 구간. 구간 사이는 잇지 않는다 */
  segments: LatLng[][];
  /** 필터 통과 GPS 거리. 표시·전송은 displayDistance 를 거친다 */
  distanceM: number;
  /** Health Connect 걸음수. 미측정은 null — 0 과 다르다 */
  steps: number | null;
  filter: FilterState;
  /** 마지막으로 필터를 통과한 점. 일시정지 중에도 갱신돼 공유된다 */
  here: (LatLng & { accuracy: number | null }) | null;
  lastPassAt: number | null;
  /** 시작·재개 시각. 첫 점이 통과하면 지운다 */
  searchingSince: number | null;
  /** 오차 때문에 연달아 버려지기 시작한 시각 */
  droppingSince: number | null;
};

type ActivityStart = Pick<Activity, 'id' | 'startedAt' | 'pausedSec' | 'paused' | 'pausedAt' | 'itemCount' | 'locationShared'> & { byCategory?: Counts };

export function newSession(a: ActivityStart, userId: string, now: number): Session {
  return {
    activityId: a.id,
    userId,
    startedAt: a.startedAt,
    pausedSec: a.pausedSec,
    paused: a.paused,
    pausedAt: a.pausedAt,
    locationShared: a.locationShared,
    itemCount: a.itemCount,
    byCategory: a.byCategory ?? {},
    segments: [[]],
    distanceM: 0,
    steps: null,
    filter: initialFilterState,
    here: null,
    lastPassAt: null,
    searchingSince: now,
    droppingSince: null,
  };
}

export function applyFix(s: Session, fix: Fix): Session {
  const result = filterFix(s.filter, fix);
  if (!result.point) {
    if (result.reason !== 'accuracy') return s;
    return { ...s, droppingSince: s.droppingSince ?? fix.timestamp };
  }
  const point = result.point;
  const base = {
    ...s,
    filter: result.state,
    here: { ...point, accuracy: fix.accuracy },
    lastPassAt: fix.timestamp,
    searchingSince: null,
    droppingSince: null,
  };
  if (s.paused) return base;
  const current = s.segments[s.segments.length - 1];
  const prev = current[current.length - 1];
  return {
    ...base,
    segments: [...s.segments.slice(0, -1), [...current, point]],
    distanceM: s.distanceM + (prev ? distanceM(prev, point) : 0),
  };
}

export function pause(s: Session, now: number): Session {
  if (s.paused) return s;
  return { ...s, paused: true, pausedAt: new Date(now).toISOString() };
}

export function resume(s: Session, now: number): Session {
  if (!s.paused) return s;
  const pausedFor = s.pausedAt ? Math.max(0, Math.floor((now - Date.parse(s.pausedAt)) / 1000)) : 0;
  return {
    ...s,
    paused: false,
    pausedAt: null,
    pausedSec: s.pausedSec + pausedFor,
    // 정지 중에 걸어간 거리를 속도 필터가 순간 이동으로 오인하지 않게 필터도 새로 시작한다
    filter: initialFilterState,
    segments: [...s.segments, []],
    searchingSince: now,
  };
}

export function addItems(s: Session, items: readonly { category: Category; quantity: number }[]): Session {
  return { ...s, ...applyPickup(s, items) };
}

export function removeItem(s: Session, item: { category: Category; quantity: number }): Session {
  return { ...s, ...undoPickup(s, item) };
}

export function elapsedSec(s: Session, now: number): number {
  const end = s.paused && s.pausedAt ? Date.parse(s.pausedAt) : now;
  return Math.max(0, Math.floor((end - Date.parse(s.startedAt)) / 1000) - s.pausedSec);
}

export function displayDistance(s: Session): number {
  return correctDistance(s.distanceM, s.steps);
}

export type GpsStatus = 'ok' | 'searching' | 'unstable';

export function gpsStatus(s: Session, now: number): GpsStatus {
  if (s.droppingSince != null && now - s.droppingSince > UNSTABLE_AFTER_MS) return 'unstable';
  if (s.searchingSince != null || s.lastPassAt == null || now - s.lastPassAt > SEARCH_AFTER_MS) return 'searching';
  return 'ok';
}

export type BannerKind = 'locationOff' | 'offline' | 'connecting' | 'searching' | 'unstable' | 'paused';

export function bannerFor(c: { locationOff: boolean; offline: boolean; connecting: boolean; gps: GpsStatus; paused: boolean }): BannerKind | null {
  if (c.locationOff) return 'locationOff';
  if (c.offline) return 'offline';
  if (c.connecting) return 'connecting';
  if (c.gps !== 'ok') return c.gps;
  return c.paused ? 'paused' : null;
}

export function livePayload(s: Session, now: number) {
  return {
    activityId: s.activityId,
    location: s.locationShared && s.here ? { lng: s.here.longitude, lat: s.here.latitude } : null,
    distanceM: Math.round(displayDistance(s)),
    itemCount: s.itemCount,
    elapsedSec: elapsedSec(s, now),
    paused: s.paused,
  };
}

export function endBody(s: Session, now: number) {
  const durationSec = elapsedSec(s, now);
  const totalSec = Math.max(0, Math.floor((now - Date.parse(s.startedAt)) / 1000));
  return {
    endedAt: new Date(now).toISOString(),
    durationSec,
    pausedSec: totalSec - durationSec,
    distanceM: Math.round(displayDistance(s)),
    steps: s.steps,
    route: s.segments.flat().map((p) => [p.longitude, p.latitude]),
  };
}

export function trackingNotice(s: Session, now: number) {
  return {
    title: s.paused ? '가치줍깅 · 일시정지 중' : '가치줍깅 · 활동 중',
    body: `${formatDistance(displayDistance(s))} · ${formatClock(elapsedSec(s, now))} · ${s.itemCount}개`,
  };
}

/** 위치 권한·OS 위치가 돌아왔다. 끊긴 동안 움직인 거리를 한 번에 잇지 않도록 새 선을 시작한다 */
export function restartLine(s: Session, now: number): Session {
  const last = s.segments[s.segments.length - 1];
  return {
    ...s,
    filter: initialFilterState,
    segments: s.paused || last.length === 0 ? s.segments : [...s.segments, []],
    searchingSince: now,
  };
}

function spokenDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h > 0 ? `${h}시간 ` : ''}${m}분`;
}

export function metricsLabel(s: Session, now: number): string {
  const distance = formatDistance(displayDistance(s)).replace('km', '킬로미터').replace(/m$/, '미터');
  const steps = s.steps == null ? '걸음수 없음' : `${s.steps}걸음`;
  return `줍기 ${s.itemCount}개, 활동 시간 ${spokenDuration(elapsedSec(s, now))}, 이동 거리 ${distance}, ${steps}`;
}
