import type { LatLng } from '../../modules/kakao-map';
import { formatDistance } from '../format';
import { formatDuration } from '../feed/activity-detail';

export type Stroke = { x: number; y: number; length: number; angle: number };

/**
 * 경로를 width×height 틀 안에 맞춰 선분으로 바꾼다. 공유 이미지는 지도를 캡처할 수 없어(네이티브
 * 지도는 화면 캡처에 안 잡힌다) 선만 그린다. 경도는 위도에 따라 좁아지므로 cos(위도)로 보정한다.
 */
export function routeStrokes(segments: readonly LatLng[][], width: number, height: number): Stroke[] {
  const all = segments.flat();
  if (all.length < 2) return [];
  const k = Math.cos((all[0].latitude * Math.PI) / 180);
  const xs = all.map((p) => p.longitude * k);
  const ys = all.map((p) => -p.latitude);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // 한쪽 폭이 0 이면(곧은 길) 그 축은 제약이 아니다
  const fit = (box: number, span: number) => (span > 0 ? box / span : Infinity);
  const scale = Math.min(fit(width, maxX - minX), fit(height, maxY - minY));
  if (!Number.isFinite(scale)) return [];
  // 좁은 쪽은 가운데에 둔다
  const offX = (width - (maxX - minX) * scale) / 2;
  const offY = (height - (maxY - minY) * scale) / 2;
  const at = (p: LatLng) => ({ x: (p.longitude * k - minX) * scale + offX, y: (-p.latitude - minY) * scale + offY });
  return segments.flatMap((seg) =>
    seg.slice(1).map((q, i) => {
      const a = at(seg[i]);
      const b = at(q);
      return { x: a.x, y: a.y, length: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }),
  );
}

export function shareLines(a: { durationSec: number; distanceM: number; steps: number | null; itemCount: number }) {
  return [
    { label: '활동 시간', value: formatDuration(a.durationSec) },
    { label: '이동 거리', value: formatDistance(a.distanceM) },
    ...(a.steps == null ? [] : [{ label: '걸음', value: a.steps.toLocaleString('en-US') }]),
    { label: '줍기', value: `${a.itemCount}개` },
  ];
}
