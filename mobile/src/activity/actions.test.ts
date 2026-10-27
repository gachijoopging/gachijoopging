import { endActivity, endIfExpired, quickPickup, recordPickup, undoPickup } from './actions';
import { newSession } from './session';
import type { EndBody } from './outbox';

let mockStored: ReturnType<typeof import('./store')['getStored']>;
jest.mock('expo-crypto', () => ({ randomUUID: () => 'i1' }));
const mockStop = jest.fn(async () => {});
const mockFinalSteps = jest.fn(async () => {});
jest.mock('./tracking', () => ({ syncOutbox: jest.fn(), isSendingItem: () => false, stopTracking: () => mockStop(), finalSteps: () => mockFinalSteps() }));
let mockWriteFails = false;
jest.mock('./store', () => ({
  getStored: () => mockStored,
  loadLastAccount: () => mockStored,
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

describe('24시간 자동 종료', () => {
  const START = Date.parse('2026-09-30T00:00:00Z');
  const endAt = async (hours: number) => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(START + hours * 3_600_000);
    try {
      await endActivity();
    } finally {
      now.mockRestore();
    }
    return mockStored.ended as EndBody;
  };

  test('24시간을 넘겨 끝내면 시작 + 24시간으로 끝내고 오프라인이어도 종료 큐에 남긴다', async () => {
    mockStored = { ...mockStored, session: { ...mockStored.session!, pausedSec: 600 } };
    const ended = await endAt(25);
    expect(ended.endedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(ended.durationSec + ended.pausedSec).toBeLessThanOrEqual(86_400);
    expect(ended.durationSec).toBe(86_400 - 600);
    expect(mockStored.outbox).toEqual([{ kind: 'end', activityId: 'a1', body: ended }]);
  });

  test('일시정지한 채 24시간을 넘겨도 멈춘 시간은 일시정지로 센다', async () => {
    mockStored = { ...mockStored, session: { ...mockStored.session!, paused: true, pausedAt: '2026-09-30T20:00:00Z' } };
    const ended = await endAt(30);
    expect(ended).toMatchObject({ endedAt: '2026-10-01T00:00:00.000Z', durationSec: 20 * 3600, pausedSec: 4 * 3600 });
  });

  test('24시간 전에 끝내면 지금으로 끝낸다', async () => {
    expect((await endAt(1)).endedAt).toBe('2026-09-30T01:00:00.000Z');
  });
});

test('4-3·배경 위치 작업·앱 복귀가 함께 끝내도 종료 기록은 하나다', async () => {
  await endActivity();
  const first = mockStored.ended;
  await endActivity();
  expect(mockStored.outbox.filter((op) => op.kind === 'end')).toHaveLength(1);
  expect(mockStored.ended).toBe(first);
});

describe('화면 없이 24시간 지난 활동 끝내기', () => {
  const START = Date.parse('2026-09-30T00:00:00Z');

  test('24시간이 지났으면 그 시점으로 끝내고 추적을 끈다', async () => {
    await expect(endIfExpired(START + 25 * 3_600_000)).resolves.toBe(true);
    expect(mockStored.outbox).toEqual([expect.objectContaining({ kind: 'end', activityId: 'a1' })]);
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  test('24시간 전이거나 이미 끝났으면 건드리지 않는다', async () => {
    await expect(endIfExpired(START + 3_600_000)).resolves.toBe(false);
    mockStored = { ...mockStored, ended: true };
    await expect(endIfExpired(START + 25 * 3_600_000)).resolves.toBe(false);
    expect(mockStored.outbox).toEqual([]);
    expect(mockStop).not.toHaveBeenCalled();
  });
});
