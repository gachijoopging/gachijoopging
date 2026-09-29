import * as Crypto from 'expo-crypto';
import type { Category } from '../category';
import { enqueue, undoItem, type ItemInput } from './outbox';
import { addItems, removeItem } from './session';
import { getStored, updateStored } from './store';
import { syncOutbox } from './tracking';

/** 시트 안 "되돌리기" 가 가리키는 마지막 담기. 되돌리기는 이 한 단위만 한다 */
export type LastPickup = { itemId: string; category: Category; quantity: number };

/**
 * 줍기를 기기에 먼저 남기고 보낸다. 디스크 쓰기가 실패하면 예외가 그대로 올라가
 * 화면이 합계를 올리지 않고 재시도를 보인다.
 */
export function recordPickup(items: (ItemInput & { aiPredictedCategory?: Category; aiConfidence?: number })[], photoId: string | null): LastPickup | null {
  const { session } = getStored();
  if (!session || items.length === 0) return null;
  updateStored((st) =>
    st.session
      ? { ...st, session: addItems(st.session, items), outbox: enqueue(st.outbox, { kind: 'items', activityId: st.session.activityId, photoId, items }) }
      : st,
  );
  void syncOutbox();
  const last = items[items.length - 1];
  return { itemId: last.id, category: last.category, quantity: last.quantity };
}

export function quickPickup(category: Category, quantity: number): LastPickup | null {
  return recordPickup([{ id: Crypto.randomUUID(), category, quantity }], null);
}

export function undoPickup(last: LastPickup) {
  updateStored((st) =>
    st.session
      ? { ...st, session: removeItem(st.session, last), outbox: undoItem(st.outbox, st.session.activityId, last.itemId) }
      : st,
  );
  void syncOutbox();
}

/** 이 작업이 아직 서버에 안 갔는가 — 시트의 "동기화 대기 / 저장됨" */
export function isPending(itemId: string): boolean {
  return getStored().outbox.some((op) => (op.kind === 'items' && op.items.some((it) => it.id === itemId)) || (op.kind === 'deleteItem' && op.itemId === itemId));
}
