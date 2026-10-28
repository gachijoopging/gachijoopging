import { discardPhoto, endActivity, quickPickup, recordPickup, undoPickup } from './actions';
import { newSession } from './session';

let mockStored: ReturnType<typeof import('./store')['getStored']>;
jest.mock('expo-crypto', () => ({ randomUUID: () => 'i1' }));
const mockStop = jest.fn(async () => {});
const mockFinalSteps = jest.fn(async () => {});
const mockSync = jest.fn();
jest.mock('./tracking', () => ({ syncOutbox: () => mockSync(), isSendingItem: () => false, stopTracking: () => mockStop(), finalSteps: () => mockFinalSteps() }));
let mockWriteFails = false;
jest.mock('./store', () => ({
  getStored: () => mockStored,
  updateStored: (fn: (st: typeof mockStored) => typeof mockStored) => { if (mockWriteFails) throw new Error('disk'); mockStored = fn(mockStored); },
}));

beforeEach(() => {
  mockWriteFails = false;
  mockSync.mockClear();
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

describe('버린 사진', () => {
  test('진행 중인 활동의 사진이면 삭제를 대기열에 넣고 바로 보낸다', () => {
    discardPhoto('m1', 'a1');
    expect(mockStored.outbox).toEqual([{ kind: 'discardPhoto', activityId: 'a1', mediaId: 'm1' }]);
    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  test('삭제는 앞선 줍기 뒤, 나중에 넣는 종료 앞에 놓인다 — 끝난 뒤에 닿으면 서버가 지우지 않는다', async () => {
    quickPickup('CAN', 1);
    discardPhoto('m1', 'a1');
    await endActivity();
    expect(mockStored.outbox.map((op) => op.kind)).toEqual(['items', 'discardPhoto', 'end']);
  });

  test.each([
    ['세션이 없으면', () => { mockStored = { ...mockStored, session: null }; }, 'a1'],
    ['종료 기록이 있으면', () => { mockStored = { ...mockStored, ended: true as never }; }, 'a1'],
    ['다른 활동이면', () => {}, 'other'],
  ])('%s 대기열에 넣지 않는다', (_label, setup, activityId) => {
    setup();
    discardPhoto('m1', activityId);
    expect(mockStored.outbox).toEqual([]);
    expect(mockSync).not.toHaveBeenCalled();
  });

  test('디스크에 못 남겨도 예외로 화면 이동을 막지 않는다', () => {
    mockWriteFails = true;
    expect(() => discardPhoto('m1', 'a1')).not.toThrow();
  });
});
