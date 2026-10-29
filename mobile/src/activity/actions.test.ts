import { discardPhoto, endActivity, endIfExpired, quickPickup, recordPickup, undoPickup } from './actions';
import { newSession } from './session';
import type { EndBody } from './outbox';

let mockStored: ReturnType<typeof import('./store')['getStored']>;
jest.mock('expo-crypto', () => ({ randomUUID: () => 'i1' }));
const mockStop = jest.fn(async () => {});
const mockFinalSteps = jest.fn(async () => {});
const mockSync = jest.fn();
jest.mock('./tracking', () => ({ syncOutbox: () => mockSync(), isSendingItem: () => false, stopTracking: () => mockStop(), finalSteps: () => mockFinalSteps() }));
let mockWriteFails = false;
let mockAfterWrite: (() => void) | null = null;
jest.mock('./store', () => ({
  getStored: () => mockStored,
  loadLastAccount: () => mockStored,
  updateStored: (fn: (st: typeof mockStored) => typeof mockStored) => { if (mockWriteFails) throw new Error('disk'); mockStored = fn(mockStored); mockAfterWrite?.(); },
}));

const START = Date.parse('2026-09-30T00:00:00Z');
const DEADLINE = START + 24 * 3_600_000;

beforeEach(() => {
  mockWriteFails = false;
  mockSync.mockClear();
  mockAfterWrite = null;
  mockStop.mockClear();
  mockFinalSteps.mockReset().mockResolvedValue(undefined);
  mockStored = { session: newSession({ id: 'a1', startedAt: '2026-09-30T00:00:00Z', pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: false }, 'u1', 0), ended: null, outbox: [] };
});

describe('줍기와 되돌리기', () => {
  const items = [{ id: 'i1', category: 'CAN' as const, quantity: 1 }];
  let now: jest.SpyInstance;
  const clockAt = (t: number) => now.mockReturnValue(t);
  beforeEach(() => { now = jest.spyOn(Date, 'now').mockReturnValue(START + 3_600_000); });
  afterEach(() => now.mockRestore());

  test('다른 활동·종료된 활동의 촬영 결과는 기록하지 않는다', () => {
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

  test('줍기는 기한 1ms 전까지 큐에 들어가고 기한 정각부터는 거절한다 — 서버는 기한을 보지 않는다', () => {
    clockAt(DEADLINE - 1);
    recordPickup(items, 'p1', 'a1');
    expect(mockStored.outbox).toEqual([expect.objectContaining({ kind: 'items', activityId: 'a1' })]);
    const queued = mockStored.outbox;
    clockAt(DEADLINE);
    expect(() => recordPickup([{ id: 'i2', category: 'CAN', quantity: 1 }], 'p2', 'a1')).toThrow();
    expect(() => quickPickup('CAN', 1)).toThrow();
    expect(mockStored.outbox).toBe(queued);
    expect(mockStored.session?.itemCount).toBe(1);
  });

  test('되돌리기도 기한 1ms 전까지 큐를 바꾸고 기한 정각부터는 거절한다', () => {
    const last = recordPickup(items, null, 'a1')!;
    clockAt(DEADLINE - 1);
    undoPickup(last);
    expect(mockStored.outbox).toEqual([]);
    expect(mockStored.session?.itemCount).toBe(0);

    clockAt(START + 3_600_000);
    const again = recordPickup(items, null, 'a1')!;
    const queued = mockStored.outbox;
    clockAt(DEADLINE);
    expect(() => undoPickup(again)).toThrow();
    expect(mockStored.outbox).toBe(queued);
    expect(mockStored.session?.itemCount).toBe(1);
  });
});

test('종료는 기록을 기기에 남긴 뒤에만 추적을 끄고, 오프라인이어도 종료 큐에 남긴다', async () => {
  await expect(endActivity('a1')).resolves.toBe('ended');
  expect(mockStored.ended).toMatchObject({ endedAt: expect.any(String) });
  expect(mockStored.outbox).toEqual([expect.objectContaining({ kind: 'end', activityId: 'a1' })]);
  expect(mockStop).toHaveBeenCalledTimes(1);
});

test('종료 기록을 남긴 직후 같은 틱에 추적을 끈다 — 그 사이에 다른 계정의 추적이 시작될 틈이 없다', async () => {
  mockAfterWrite = () => {
    mockAfterWrite = null;
    queueMicrotask(() => { mockStored = { session: newSession({ id: 'b1', startedAt: '2026-09-30T00:00:00Z', pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: false }, 'u2', 0), ended: null, outbox: [] }; });
  };
  let sessionAtStop: string | undefined;
  mockStop.mockImplementationOnce(async () => { sessionAtStop = mockStored.session?.activityId; });
  await endActivity('a1');
  expect(sessionAtStop).toBe('a1');
});

test('디스크에 못 남기면 추적을 끄지 않고 saveFailed 를 돌려준다 — 기록을 잃지 않게', async () => {
  mockWriteFails = true;
  await expect(endActivity('a1')).resolves.toBe('saveFailed');
  expect(mockStop).not.toHaveBeenCalled();
  expect(mockStored.ended).toBeNull();
});

test('종료 직전 걸음을 못 읽으면 걸음을 미측정으로 남긴다', async () => {
  mockStored = { ...mockStored, session: { ...mockStored.session!, steps: 100 } };
  mockFinalSteps.mockRejectedValueOnce(new Error('hc'));
  await endActivity('a1');
  expect((mockStored.ended as { steps: number | null }).steps).toBeNull();
});

describe('버린 사진', () => {
  let now: jest.SpyInstance;
  beforeEach(() => { now = jest.spyOn(Date, 'now').mockReturnValue(START + 3_600_000); });
  afterEach(() => now.mockRestore());

  test('진행 중인 활동의 사진이면 삭제를 대기열에 넣고 바로 보낸다', () => {
    discardPhoto('m1', 'a1');
    expect(mockStored.outbox).toEqual([{ kind: 'discardPhoto', activityId: 'a1', mediaId: 'm1' }]);
    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  test('삭제는 앞선 줍기 뒤, 나중에 넣는 종료 앞에 놓인다 — 끝난 뒤에 닿으면 서버가 지우지 않는다', async () => {
    quickPickup('CAN', 1);
    discardPhoto('m1', 'a1');
    await endActivity('a1');
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

describe('24시간 자동 종료', () => {
  const endAt = async (hours: number) => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(START + hours * 3_600_000);
    try {
      await endActivity('a1');
    } finally {
      now.mockRestore();
    }
    return mockStored.ended as EndBody;
  };

  test('24시간을 넘겨 끝내면 시작 + 24시간으로 끝내고 오프라인이어도 종료 큐에 남긴다', async () => {
    mockStored = { ...mockStored, session: { ...mockStored.session!, pausedSec: 600, pauses: [['2026-09-30T01:00:00.000Z', '2026-09-30T01:10:00.000Z']] } };
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
  await endActivity('a1');
  const first = mockStored.ended;
  await endActivity('a1');
  expect(mockStored.outbox.filter((op) => op.kind === 'end')).toHaveLength(1);
  expect(mockStored.ended).toBe(first);
});

describe('화면 없이 24시간 지난 활동 끝내기', () => {
  test('24시간이 지났으면 그 시점으로 끝내고 추적을 끈다', async () => {
    await expect(endIfExpired(START + 25 * 3_600_000)).resolves.toBe('ended');
    expect(mockStored.outbox).toEqual([expect.objectContaining({ kind: 'end', activityId: 'a1' })]);
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  test('24시간 전이거나 이미 끝났으면 건드리지 않는다', async () => {
    await expect(endIfExpired(START + 3_600_000)).resolves.toBeNull();
    mockStored = { ...mockStored, ended: true };
    await expect(endIfExpired(START + 25 * 3_600_000)).resolves.toBeNull();
    expect(mockStored.outbox).toEqual([]);
    expect(mockStop).not.toHaveBeenCalled();
  });

  test('디스크에 못 남기면 saveFailed 를 돌려준다 — 4-3 밖에서도 실패를 보이고 다시 시도하게', async () => {
    mockWriteFails = true;
    await expect(endIfExpired(START + 25 * 3_600_000)).resolves.toBe('saveFailed');
    expect(mockStop).not.toHaveBeenCalled();
  });

  test.each([
    ['다른 계정의 활동이 열리면 그 활동을 끝내지 않고 그 추적도 끄지 않는다', 'b1', null],
    ['같은 활동이 그대로면 끝낸다', 'a1', 'ended'],
  ] as const)('걸음을 기다리는 사이 %s', async (_label, openedId, result) => {
    let read!: () => void;
    mockFinalSteps.mockImplementationOnce(() => new Promise<void>((r) => { read = r; }));
    const ending = endIfExpired(START + 25 * 3_600_000);
    if (openedId !== 'a1') {
      mockStored = { session: newSession({ id: openedId, startedAt: new Date().toISOString(), pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: false }, 'u2', 0), ended: null, outbox: [] };
    }
    read();
    await expect(ending).resolves.toBe(result);
    expect(mockStored.outbox.filter((op) => op.kind === 'end')).toHaveLength(result ? 1 : 0);
    expect(mockStored.ended == null).toBe(!result);
    expect(mockStop).toHaveBeenCalledTimes(result ? 1 : 0);
  });
});
