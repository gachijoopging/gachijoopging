import type { Category } from '../category';

export type ItemInput = { id: string; category: Category; quantity: number; aiPredictedCategory?: Category; aiConfidence?: number };
export type EndBody = {
  endedAt: string;
  durationSec: number;
  pausedSec: number;
  distanceM: number;
  steps: number | null;
  route: number[][];
};

/** 서버로 보낼 활동 변경 하나. 온라인이어도 먼저 여기 넣고 보낸다 — 보내다 죽어도 남아 있게 */
export type Op =
  | { kind: 'items'; activityId: string; photoId: string | null; items: ItemInput[] }
  | { kind: 'deleteItem'; activityId: string; itemId: string }
  | { kind: 'pause' | 'resume'; activityId: string }
  | { kind: 'end'; activityId: string; body: EndBody };

export function enqueue(q: readonly Op[], op: Op): Op[] {
  return [...q, op];
}

/**
 * 순서대로 보내고 처음 실패한 곳에서 멈춘다. 실패한 것은 지우지 않는다 —
 * 줍기가 서버에 없는데 종료가 먼저 가면 합계가 틀어진다.
 */
export async function flush(q: readonly Op[], send: (op: Op) => Promise<void>): Promise<Op[]> {
  for (let i = 0; i < q.length; i++) {
    try {
      await send(q[i]);
    } catch {
      return q.slice(i);
    }
  }
  return [];
}

export function pendingEnd(q: readonly Op[]): Extract<Op, { kind: 'end' }> | null {
  return (q.find((op) => op.kind === 'end') as Extract<Op, { kind: 'end' }> | undefined) ?? null;
}

export function undoItem(q: readonly Op[], activityId: string, itemId: string, sending = false): Op[] {
  const unsent = q.some((op) => op.kind === 'items' && op.items.some((it) => it.id === itemId));
  if (unsent && !sending) {
    return q.flatMap<Op>((op) => {
      if (op.kind !== 'items') return [op];
      const rest = op.items.filter((it) => it.id !== itemId);
      return rest.length ? [{ ...op, items: rest }] : [];
    });
  }
  const del: Op = { kind: 'deleteItem', activityId, itemId };
  const endAt = q.findIndex((op) => op.kind === 'end' && op.activityId === activityId);
  return endAt < 0 ? [...q, del] : [...q.slice(0, endAt), del, ...q.slice(endAt)];
}

export const serialize = (q: readonly Op[]) => JSON.stringify(q);

export function restore(text: string | null): Op[] {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
