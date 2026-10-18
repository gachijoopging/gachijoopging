import { endActivity, quickPickup, recordPickup, undoPickup } from './actions';
import { newSession } from './session';

let mockStored: ReturnType<typeof import('./store')['getStored']>;
jest.mock('expo-crypto', () => ({ randomUUID: () => 'i1' }));
const mockStop = jest.fn(async () => {});
const mockFinalSteps = jest.fn(async () => {});
jest.mock('./tracking', () => ({ syncOutbox: jest.fn(), isSendingItem: () => false, stopTracking: () => mockStop(), finalSteps: () => mockFinalSteps() }));
let mockWriteFails = false;
jest.mock('./store', () => ({
  getStored: () => mockStored,
  updateStored: (fn: (st: typeof mockStored) => typeof mockStored) => { if (mockWriteFails) throw new Error('disk'); mockStored = fn(mockStored); },
}));

beforeEach(() => {
  mockWriteFails = false;
  mockStop.mockClear();
  mockFinalSteps.mockReset().mockResolvedValue(undefined);
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

test('종료는 기록을 기기에 남긴 뒤에만 추적을 끄고, 오프라인이어도 종료 큐에 남긴다', async () => {
  await expect(endActivity()).resolves.toBe('ended');
  expect(mockStored.ended).toMatchObject({ endedAt: expect.any(String) });
  expect(mockStored.outbox).toEqual([expect.objectContaining({ kind: 'end', activityId: 'a1' })]);
  expect(mockStop).toHaveBeenCalledTimes(1);
});

test('디스크에 못 남기면 추적을 끄지 않고 saveFailed 를 돌려준다 — 기록을 잃지 않게', async () => {
  mockWriteFails = true;
  await expect(endActivity()).resolves.toBe('saveFailed');
  expect(mockStop).not.toHaveBeenCalled();
  expect(mockStored.ended).toBeNull();
});

test('종료 직전 걸음을 못 읽으면 걸음을 미측정으로 남긴다', async () => {
  mockStored = { ...mockStored, session: { ...mockStored.session!, steps: 100 } };
  mockFinalSteps.mockRejectedValueOnce(new Error('hc'));
  await endActivity();
  expect((mockStored.ended as { steps: number | null }).steps).toBeNull();
});
