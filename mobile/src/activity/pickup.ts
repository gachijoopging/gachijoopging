import { CATEGORY_LABEL, type Category } from '../category';
import type { ItemInput } from './outbox';

/** 계약 ItemInput.quantity 상한. 넘으면 422 */
export const QUANTITY_MAX = 999;
/** 이 값 미만 탐지가 하나라도 있으면 "확인 필요". 정답 확률로 보이지 않는다 */
export const CONFIDENCE_CHECK = 0.7;

const ORDER = Object.keys(CATEGORY_LABEL) as Category[];

export type Detection = { category: Category; aiConfidence: number };
export type Inference = { status: 'OK'; items: readonly Detection[] } | { status: 'UNAVAILABLE'; items: null } | null;
export type Group = { count: number; needsCheck: boolean; maxConfidence: number };
export type Counts = Partial<Record<Category, number>>;

export function groupDetections(items: readonly Detection[]): Partial<Record<Category, Group>> {
  const out: Partial<Record<Category, Group>> = {};
  for (const { category, aiConfidence } of items) {
    const g = out[category] ?? { count: 0, needsCheck: false, maxConfidence: 0 };
    out[category] = {
      count: g.count + 1,
      needsCheck: g.needsCheck || aiConfidence < CONFIDENCE_CHECK,
      maxConfidence: Math.max(g.maxConfidence, aiConfidence),
    };
  }
  return out;
}

export function aiBanner(inference: Inference): 'unavailable' | 'none' | 'check' | null {
  if (!inference || inference.status !== 'OK') return 'unavailable';
  if (inference.items.length === 0) return 'none';
  return inference.items.some((d) => d.aiConfidence < CONFIDENCE_CHECK) ? 'check' : null;
}

export function itemsFromCounts(
  counts: Counts,
  groups: Partial<Record<Category, Group>>,
  newId: () => string,
): (ItemInput & { aiPredictedCategory?: Category; aiConfidence?: number })[] {
  return ORDER.flatMap((category) => {
    const quantity = counts[category] ?? 0;
    if (quantity < 1) return [];
    const g = groups[category];
    return [g ? { id: newId(), category, quantity, aiPredictedCategory: category, aiConfidence: g.maxConfidence } : { id: newId(), category, quantity }];
  });
}

/** 직접 입력한 수량. 0 이상 정수만 받는다 — 빈 값·소수·음수·상한 초과는 null */
export function parseQuantity(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n <= QUANTITY_MAX ? n : null;
}

export const totalOf = (counts: Counts) => Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);

export type Tally = { itemCount: number; byCategory: Counts };

export function applyPickup(t: Tally, items: readonly { category: Category; quantity: number }[]): Tally {
  const byCategory = { ...t.byCategory };
  for (const it of items) byCategory[it.category] = (byCategory[it.category] ?? 0) + it.quantity;
  return { itemCount: t.itemCount + items.reduce((s, it) => s + it.quantity, 0), byCategory };
}

export function undoPickup(t: Tally, item: { category: Category; quantity: number }): Tally {
  const byCategory = { ...t.byCategory };
  const left = (byCategory[item.category] ?? 0) - item.quantity;
  if (left > 0) byCategory[item.category] = left;
  else delete byCategory[item.category];
  return { itemCount: Math.max(0, t.itemCount - item.quantity), byCategory };
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const kst = (iso: string) => new Date(Date.parse(iso) + KST_OFFSET_MS);
const hm = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

export function summaryMeta({ startedAt, endedAt, pausedSec, steps }: { startedAt: string; endedAt: string; pausedSec: number; steps: number | null }): string {
  const s = kst(startedAt);
  const parts = [`${s.getUTCMonth() + 1}월 ${s.getUTCDate()}일 (${WEEKDAY[s.getUTCDay()]}) ${hm(s)}~${hm(kst(endedAt))}`];
  if (pausedSec >= 60) parts.push(`일시정지 ${Math.floor(pausedSec / 60)}분`);
  if (steps != null) parts.push(`${steps.toLocaleString('en-US')}걸음`);
  return parts.join(' · ');
}

export function byCategoryChips(byCategory: Counts): { category: Category; count: number }[] {
  return ORDER.filter((c) => (byCategory[c] ?? 0) > 0)
    .map((category) => ({ category, count: byCategory[category] ?? 0 }))
    .sort((a, b) => b.count - a.count || ORDER.indexOf(a.category) - ORDER.indexOf(b.category));
}

const WEEKDAY_FULL = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const spokenTime = (d: Date) => `${d.getUTCHours()}시 ${d.getUTCMinutes()}분`;

/** 스크린리더용 메타. "09:02~09:48 ·" 같은 기호를 그대로 읽지 않게 문장으로 */
export function summaryMetaSpoken({ startedAt, endedAt, pausedSec, steps }: { startedAt: string; endedAt: string; pausedSec: number; steps: number | null }): string {
  const s = kst(startedAt);
  const parts = [`${s.getUTCMonth() + 1}월 ${s.getUTCDate()}일 ${WEEKDAY_FULL[s.getUTCDay()]} ${spokenTime(s)}부터 ${spokenTime(kst(endedAt))}까지`];
  if (pausedSec >= 60) parts.push(`일시정지 ${Math.floor(pausedSec / 60)}분`);
  if (steps != null) parts.push(`${steps.toLocaleString('en-US')}걸음`);
  return parts.join(', ');
}
