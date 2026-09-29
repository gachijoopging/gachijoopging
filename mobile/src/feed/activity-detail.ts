import { CATEGORY_LABEL, type Category } from '../category';
import { formatDistance, formatElapsed } from '../format';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function kstDateTime(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  const h = kst.getUTCHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const min = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${h < 12 ? '오전' : '오후'} ${hour12}:${min}`;
}

/** 짧은 활동도 정상 기록이라 1분 미만을 0분으로 뭉개지 않는다 */
export function formatDuration(sec: number): string {
  return sec < 60 ? `${sec}초` : formatElapsed(sec);
}

type Metrics = { itemCount: number; durationSec: number; distanceM: number; steps: number | null };

export function metricsLabel({ itemCount, durationSec, distanceM, steps }: Metrics): string {
  const parts = [`줍기 ${itemCount}개`, `활동 시간 ${formatDuration(durationSec)}`, `이동 거리 ${formatDistance(distanceM)}`];
  // 미측정(null)은 0걸음과 다르다 — 없는 값을 읽지 않는다
  if (steps != null) parts.push(`${steps}걸음`);
  return parts.join(', ');
}

const ORDER = Object.keys(CATEGORY_LABEL) as Category[];

export function categoryChips(byCategory: Partial<Record<string, number>>): string[] {
  return ORDER.filter((c) => (byCategory[c] ?? 0) > 0).map((c) => `${CATEGORY_LABEL[c]} ${byCategory[c]}`);
}

export const QUANTITY_MAX = 999;

export function parseQuantity(text: string): number | null {
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= QUANTITY_MAX ? n : null;
}

export function routeToPath(route: readonly (readonly number[])[] | null): { latitude: number; longitude: number }[] {
  return (route ?? []).map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
}

export type EditableItem ={ id: string; category: Category; quantity: number };

export function changedItems(saved: readonly EditableItem[], edited: readonly EditableItem[]): EditableItem[] {
  const byId = new Map(saved.map((i) => [i.id, i]));
  return edited.filter((e) => {
    const s = byId.get(e.id);
    return s && (s.category !== e.category || s.quantity !== e.quantity);
  });
}
