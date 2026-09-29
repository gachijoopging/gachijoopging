import type { LatLng } from '../../modules/kakao-map';

export type Fix = LatLng & {
  /** 오차 반경(m). 기기가 모른다고 하면 null */
  accuracy: number | null;
  /** epoch ms */
  timestamp: number;
};

export const MAX_ACCURACY_M = 30;
export const MAX_SPEED_MPS = 5;
/** 평활화 창. 기능범위의 "최근 3~5점" 중 가운데 */
export const SMOOTH_WINDOW = 4;
export const STEP_LENGTH_M = 0.7;
export const STEP_TOLERANCE = 0.3;

export type FilterState = { last: Fix | null; recent: LatLng[] };
export type FilterResult =
  | { state: FilterState; point: LatLng }
  | { state: FilterState; point: null; reason: 'accuracy' | 'speed' };

export const initialFilterState: FilterState = { last: null, recent: [] };

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** 필터 1~3단계. 떨어진 점은 경로·거리·소켓 어디에도 쓰지 않는다 */
export function filterFix(state: FilterState, fix: Fix): FilterResult {
  // 오차를 모르는 점은 30m 이내라고 확인할 수 없으므로 버린다
  if (fix.accuracy == null || fix.accuracy > MAX_ACCURACY_M) {
    return { state, point: null, reason: 'accuracy' };
  }
  if (state.last) {
    const sec = (fix.timestamp - state.last.timestamp) / 1000;
    if (sec <= 0 || distanceM(state.last, fix) / sec > MAX_SPEED_MPS) {
      return { state, point: null, reason: 'speed' };
    }
  }
  const raw = { latitude: fix.latitude, longitude: fix.longitude };
  const recent = [...state.recent, raw].slice(-SMOOTH_WINDOW);
  const point = {
    latitude: recent.reduce((s, p) => s + p.latitude, 0) / recent.length,
    longitude: recent.reduce((s, p) => s + p.longitude, 0) / recent.length,
  };
  return { state: { last: fix, recent }, point };
}

/**
 * 필터 4단계. 한 보행 구간의 GPS 거리를 걸음수와 대조한다.
 * 걸음수 null(미측정)과 0(쓸 수 없는 값)은 보정 근거가 아니다 — 거리를 0으로 만들지 않는다.
 */
export function correctDistance(gpsM: number, steps: number | null): number {
  if (steps == null || steps <= 0) return gpsM;
  const stepM = steps * STEP_LENGTH_M;
  return gpsM > stepM * (1 + STEP_TOLERANCE) ? stepM : gpsM;
}
