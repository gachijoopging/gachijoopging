import { quickPickup, recordPickup, undoPickup } from './actions';
import { newSession } from './session';

let mockStored: ReturnType<typeof import('./store')['getStored']>;
jest.mock('expo-crypto', () => ({ randomUUID: () => 'i1' }));
jest.mock('./tracking', () => ({ syncOutbox: jest.fn(), isSendingItem: () => false }));
jest.mock('./store', () => ({
  getStored: () => mockStored,
  updateStored: (fn: (st: typeof mockStored) => typeof mockStored) => { mockStored = fn(mockStored); },
}));

beforeEach(() => {
  mockStored = { session: newSession({ id: 'a1', startedAt: '2026-09-30T00:00:00Z', pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: false }, 'u1', 0), ended: null, outbox: [] };
});

test('다른 활동·종료된 활동의 촬영 결과는 기록하지 않는다', () => {
  const items = [{ id: 'i1', category: 'CAN' as const, quantity: 1 }];
  expect(() => recordPickup(items, 'p1', 'other')).toThrow();
  mockStored.ended = true;
  expect(() => quickPickup('CAN', 1)).toThrow();
  expect(mockStored.session?.itemCount).toBe(0);
  expect(mockStored.outbox).toEqual([]);
});

test('오프라인 줍기와 미전송 되돌리기는 합계와 큐를 함께 바꾼다', () => {
  const last = quickPickup('CAN', 2)!;
  expect(mockStored.session?.itemCount).toBe(2);
  expect(mockStored.outbox).toHaveLength(1);
  undoPickup(last);
  expect(mockStored.session?.itemCount).toBe(0);
  expect(mockStored.outbox).toEqual([]);
});
