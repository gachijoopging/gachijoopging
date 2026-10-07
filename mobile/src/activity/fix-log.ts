import type { Fix } from './location-filter';

const cosLat = (deg: number) => Math.cos((deg * Math.PI) / 180);

/** 필터를 거치기 전 위치 한 점. 실측 fixture 로 필터를 튜닝하려고 남긴다 */
export function fixLogLine(fix: Fix): string {
  return JSON.stringify([fix.latitude, fix.longitude, fix.accuracy, fix.timestamp]) + '\n';
}

export function parseFixLog(text: string): Fix[] {
  return text.split('\n').flatMap((line) => {
    try {
      const [latitude, longitude, accuracy, timestamp] = JSON.parse(line);
      if (typeof latitude !== 'number' || typeof longitude !== 'number' || typeof timestamp !== 'number') return [];
      return [{ latitude, longitude, accuracy: typeof accuracy === 'number' ? accuracy : null, timestamp }];
    } catch {
      return [];
    }
  });
}

/** 공유할 fixture 의 기준점(서울시청). 절대 위치만 지운다 — 경로 모양은 남는다 */
export const ANON_ORIGIN = { latitude: 37.5665, longitude: 126.978 };

/** 위도가 바뀌면 경도 1도의 길이가 달라지므로, 동서 거리가 그대로 남도록 경도 차를 다시 잰다 */
export function anonymize(fixes: readonly Fix[]): Fix[] {
  const first = fixes[0];
  if (!first) return [];
  const lngScale = cosLat(first.latitude) / cosLat(ANON_ORIGIN.latitude);
  return fixes.map((f) => ({
    latitude: f.latitude - first.latitude + ANON_ORIGIN.latitude,
    longitude: (f.longitude - first.longitude) * lngScale + ANON_ORIGIN.longitude,
    accuracy: f.accuracy,
    timestamp: f.timestamp - first.timestamp,
  }));
}
