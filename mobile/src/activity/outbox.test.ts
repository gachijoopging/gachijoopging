import { enqueue, flush, pendingEnd, restore, serialize, undoItem, type Op } from './outbox';

const items = (ids: string[]): Op => ({
  kind: 'items',
  activityId: 'a1',
  photoId: null,
  items: ids.map((id) => ({ id, category: 'CAN' as const, quantity: 1 })),
});
const end: Op = { kind: 'end', activityId: 'a1', body: { endedAt: '2026-09-29T10:00:00Z', durationSec: 60, pausedSec: 0, distanceM: 10, steps: null, route: [] } };

describe('오프라인 큐', () => {
  test('넣은 순서대로 보낸다 — 줍기가 종료보다 먼저다', async () => {
    const sent: string[] = [];
    const q = [items(['i1']), { kind: 'pause', activityId: 'a1' } as Op, end];
    const left = await flush(q, async (op) => void sent.push(op.kind));
    expect(sent).toEqual(['items', 'pause', 'end']);
    expect(left).toEqual([]);
  });

  test('실패하면 그 자리에서 멈추고 실패한 것과 뒤의 것을 모두 남긴다', async () => {
    const sent: string[] = [];
    const q = [items(['i1']), items(['i2']), end];
    const left = await flush(q, async (op) => {
      if (op.kind === 'items' && op.items[0].id === 'i2') throw new Error('offline');
      sent.push(op.kind);
    });
    expect(sent).toEqual(['items']);
    expect(left).toEqual([items(['i2']), end]);
  });

  test('종료가 실패해도 지우지 않는다 — 다음 연결 때 다시 보낸다', async () => {
    const left = await flush([end], async () => {
      throw new Error('500');
    });
    expect(left).toEqual([end]);
    expect(pendingEnd(left)?.activityId).toBe('a1');
  });

  test('재실행해도 디스크에서 그대로 복구된다', () => {
    const q = enqueue(enqueue([], items(['i1'])), end);
    expect(restore(serialize(q))).toEqual(q);
  });

  test('깨진 파일은 빈 큐로 읽되 예외를 내지 않는다', () => {
    expect(restore('{not json')).toEqual([]);
    expect(restore(null)).toEqual([]);
  });
});

describe('줍기 되돌리기', () => {
  test('아직 안 보낸 줍기는 큐에서 빼기만 한다', () => {
    const q = undoItem([items(['i1', 'i2'])], 'a1', 'i1');
    expect(q).toEqual([items(['i2'])]);
  });

  test('한 건뿐인 요청이면 요청째 뺀다', () => {
    expect(undoItem([items(['i1'])], 'a1', 'i1')).toEqual([]);
  });

  test('이미 보낸 줍기는 같은 id 의 삭제를 큐에 넣는다', () => {
    expect(undoItem([], 'a1', 'i9')).toEqual([{ kind: 'deleteItem', activityId: 'a1', itemId: 'i9' }]);
  });

  test('종료가 이미 큐에 있으면 삭제를 종료 앞에 끼운다', () => {
    const q = undoItem([end], 'a1', 'i9');
    expect(q.map((op) => op.kind)).toEqual(['deleteItem', 'end']);
  });
});
