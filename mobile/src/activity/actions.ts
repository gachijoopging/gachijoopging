import * as Crypto from 'expo-crypto';
import type { Category } from '../category';
import { enqueue, undoItem, type ItemInput } from './outbox';
import { activityDeadline, addItems, closeSegment, endBody, removeItem } from './session';
import { getStored, loadLastAccount, updateStored } from './store';
import { finalSteps, isSendingItem, stopTracking, syncOutbox } from './tracking';

/** 시트 안 "되돌리기" 가 가리키는 마지막 담기. 되돌리기는 이 한 단위만 한다 */
export type LastPickup = { itemId: string; category: Category; quantity: number };

/**
 * 줍기를 기기에 먼저 남기고 보낸다. 디스크 쓰기가 실패하면 예외가 그대로 올라가
 * 화면이 합계를 올리지 않고 재시도를 보인다.
 */
export function recordPickup(items: (ItemInput & { aiPredictedCategory?: Category; aiConfidence?: number })[], photoId: string | null, activityId: string): LastPickup | null {
  const { session, ended } = getStored();
  if (!session || ended || session.activityId !== activityId) throw new Error('진행 중인 활동이 아니에요');
  if (items.length === 0) return null;
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
  return recordPickup([{ id: Crypto.randomUUID(), category, quantity }], null, getStored().session?.activityId ?? '');
}

export function undoPickup(last: LastPickup) {
  if (getStored().ended || !getStored().session) throw new Error('진행 중인 활동이 아니에요');
  updateStored((st) =>
    st.session
      ? { ...st, session: removeItem(st.session, last), outbox: undoItem(st.outbox, st.session.activityId, last.itemId, isSendingItem(last.itemId)) }
      : st,
  );
  void syncOutbox();
}

/** 이 작업이 아직 서버에 안 갔는가 — 시트의 "동기화 대기 / 저장됨" */
export function isPending(itemId: string): boolean {
  return getStored().outbox.some((op) => (op.kind === 'items' && op.items.some((it) => it.id === itemId)) || (op.kind === 'deleteItem' && op.itemId === itemId));
}

/** 종료 직전 걸음 읽기를 기다리는 한도. Health Connect 가 늦어도 종료는 이보다 오래 기다리지 않는다 */
const FINAL_STEPS_WAIT_MS = 1_500;

/**
 * 활동을 기기에서 끝낸다 — 종료 기록을 디스크에 먼저 남기고, 남은 뒤에만 추적을 끈다.
 * 'saveFailed' 면 추적이 그대로 켜져 있다. 여기서 넘어가면 기록을 잃으므로 화면은 다시 시도하게 한다.
 * 'stale' 이면 걸음을 기다리는 사이 다른 계정의 기록이 열렸다. 아무것도 쓰지 않고, 기기 전역인 위치 추적도
 * 이제 그 계정 활동의 것이므로 끄지 않는다.
 * 서버 전송은 큐가 맡는다 — 오프라인이어도 'ended' 다.
 */
export async function endActivity(activityId: string): Promise<'ended' | 'saveFailed' | 'stale'> {
  // 마지막 읽기 뒤 걸음까지 담는다. 실패하거나 늦으면 기다리지 않는다
  const counted = await Promise.race([
    finalSteps().then(() => true, () => false),
    new Promise<boolean>((r) => setTimeout(() => r(false), FINAL_STEPS_WAIT_MS)),
  ]);
  if (getStored().session?.activityId !== activityId) return 'stale';
  try {
    updateStored((st) => {
      // 4-3·배경 위치 작업·앱 복귀가 함께 끝내려 해도 종료 기록은 하나다
      if (!st.session || st.ended) return st;
      // 종료 시각까지 읽지 못한 걸음은 일부 구간 값이다. 그것으로 전체 거리를 줄이지 않는다
      const measured = counted ? st.session : { ...st.session, steps: null };
      // 요약 지도·공유 카드도 종료 기록과 같은 경로를 그리도록 닫은 세션을 남긴다
      const session = measured.paused ? measured : closeSegment(measured);
      // 24시간을 넘겨 끝내면(자동 종료가 늦게 돈 경우) 그 시점으로 끝낸다
      const body = endBody(session, Math.min(Date.now(), activityDeadline(session)));
      return { ...st, session, ended: body, outbox: enqueue(st.outbox, { kind: 'end', activityId: st.session.activityId, body }) };
    });
  } catch {
    return 'saveFailed';
  }
  await stopTracking();
  void syncOutbox();
  return 'ended';
}

/**
 * 시작 24시간이 지난 활동을 끝낸다. 4-3 이 없어도(배경 위치 작업·콜드 스타트·앱 복귀) 같은 종료를 탄다.
 * 기한 전·활동 없음·기다리는 사이 다른 계정이 열린 경우는 null
 */
export async function endIfExpired(now = Date.now()): Promise<'ended' | 'saveFailed' | null> {
  const st = loadLastAccount();
  if (!st?.session || st.ended || now < activityDeadline(st.session)) return null;
  const result = await endActivity(st.session.activityId);
  return result === 'stale' ? null : result;
}
