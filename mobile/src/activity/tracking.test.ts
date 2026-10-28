const snapshot = { endedAt: '2026-09-30T00:01:00Z', durationSec: 60, pausedSec: 0, distanceM: 10, steps: null, route: [] };
import { ApiError, createMockClient, type ApiClient } from '../api/client';
import type { Op } from './outbox';
import { undoItem } from './outbox';
import { displayDistance, newSession, pause, resume, type Session } from './session';
import { finalSteps, isSendingItem, refreshSteps, startTracking, stopTracking, syncOutbox, tick, TRACKING_TASK } from './tracking';
import type { StepSource } from './steps';

let mockStored: ReturnType<typeof import('./store')['getStored']>;
const mockMutate = jest.mocked(createMockClient().mutate);
const mockPermission = jest.fn().mockResolvedValue({ granted: true });
const mockEnabled = jest.fn().mockResolvedValue(true);
const mockStart = jest.fn().mockResolvedValue(undefined);
const mockStopLocation = jest.fn().mockResolvedValue(undefined);
const mockHasStarted = jest.fn().mockResolvedValue(true);
jest.mock('../api/client', () => {
  const client = { mutate: jest.fn().mockResolvedValue({}) };
  return { ...jest.requireActual('../api/client'), createMockClient: () => client };
});
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  hasStartedLocationUpdatesAsync: (...args: unknown[]) => mockHasStarted(...args),
  stopLocationUpdatesAsync: (...args: unknown[]) => mockStopLocation(...args),
  startLocationUpdatesAsync: (...args: unknown[]) => mockStart(...args),
  getForegroundPermissionsAsync: (...args: unknown[]) => mockPermission(...args),
  hasServicesEnabledAsync: (...args: unknown[]) => mockEnabled(...args),
}));
const mockNetwork = jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true });
jest.mock('expo-network', () => ({ getNetworkStateAsync: () => mockNetwork() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'u' }));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('../../modules/tracking-notification', () => ({ updateTrackingNotification: jest.fn() }));
jest.mock('./store', () => ({
  getStored: () => mockStored,
  loadLastAccount: () => mockStored,
  updateStored: (fn: (st: typeof mockStored) => typeof mockStored) => { mockStored = fn(mockStored); },
}));
const mockEndIfExpired = jest.fn(async (): Promise<'ended' | 'saveFailed' | null> => null);
jest.mock('./actions', () => ({ endIfExpired: () => mockEndIfExpired() }));

beforeEach(() => {
  mockStored = { session: null, ended: null, outbox: [] };
  mockMutate.mockClear();
  mockPermission.mockResolvedValue({ granted: true });
  mockEnabled.mockResolvedValue(true);
  mockStart.mockClear();
  mockStopLocation.mockReset().mockResolvedValue(undefined);
  mockHasStarted.mockReset().mockResolvedValue(true);
  mockNetwork.mockResolvedValue({ isConnected: true, isInternetReachable: true });
});

test('작업이 등록되어 있어도 재실행에서 포그라운드 서비스를 다시 시작한다', async () => {
  mockStored.session = newSession({ id: 'a1', startedAt: '2026-09-30T00:00:00Z', pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: false }, 'u1', 0);
  expect(await startTracking()).toBe(true);
  expect(mockStart).toHaveBeenCalledWith('gachi-activity-tracking', expect.objectContaining({ foregroundService: expect.any(Object) }));
  mockStored.ended = snapshot;
  expect(await startTracking()).toBe(false);
  expect(mockStart).toHaveBeenCalledTimes(1);
});

test('빈 큐를 동기화해도 다음 동기화를 막지 않는다', async () => {
  await syncOutbox();
  mockStored.outbox = [{ kind: 'pause', activityId: 'a1' }];
  await syncOutbox();
  expect(mockMutate).toHaveBeenCalledTimes(1);
  expect(mockStored.outbox).toEqual([]);
});

test('전송 중 되돌린 줍기는 생성 응답 뒤 삭제한다', async () => {
  mockStored.outbox = [{ kind: 'items', activityId: 'a1', photoId: null, items: [{ id: 'i1', category: 'CAN', quantity: 1 }] }];
  const mutate = jest.fn().mockImplementationOnce(async () => {
    mockStored.outbox = undoItem(mockStored.outbox, 'a1', 'i1', isSendingItem('i1'));
  }).mockResolvedValue({});
  expect(await syncOutbox({ mutate } as unknown as ApiClient)).toBe(true);
  expect(mutate.mock.calls.map(([path]) => path)).toEqual(['POST /activities/{id}/items', 'DELETE /activities/{id}/items/{itemId}']);
  expect(mockStored.outbox).toEqual([]);
});

test('오프라인은 큐를 보존하고 연결 후 재시도한다', async () => {
  mockStored.outbox = [{ kind: 'pause', activityId: 'a1' }];
  mockNetwork.mockResolvedValue({ isConnected: false });
  expect(await syncOutbox()).toBe(false);
  expect(mockMutate).not.toHaveBeenCalled();
  mockNetwork.mockResolvedValue({ isConnected: true });
  expect(await syncOutbox()).toBe(true);
  expect(mockStored.outbox).toEqual([]);
});

test.each(['success', 'conflict'])('종료 %s 응답은 서버 합계와 스냅샷을 반영한다', async (kind) => {
  mockStored.session = newSession({ id: 'a1', startedAt: '2026-09-30T00:00:00Z', pausedSec: 0, paused: false, pausedAt: null, itemCount: 2, locationShared: false }, 'u1', 0);
  mockStored.ended = snapshot;
  mockStored.outbox = [{ kind: 'end', activityId: 'a1', body: snapshot }];
  const data = { ...snapshot, id: 'a1', status: 'ENDED', distanceM: 20, itemCount: 2, byCategory: { CAN: 2 } };
  const mutate = kind === 'conflict' ? jest.fn().mockRejectedValue(new ApiError('CONFLICT')) : jest.fn().mockResolvedValue({ data });
  const get = jest.fn().mockResolvedValue({ data });
  expect(await syncOutbox({ mutate, get } as unknown as ApiClient)).toBe(true);
  expect(mockStored.ended).toEqual(expect.objectContaining({ distanceM: 20 }));
  expect(mockStored.session?.byCategory).toEqual({ CAN: 2 });
  expect(mockStored.outbox).toEqual([]);
});

test('이미 종료됐어도 줍기 합계가 다른 상세는 완료 처리하지 않는다', async () => {
  mockStored.session = newSession({ id: 'a1', startedAt: '2026-09-30T00:00:00Z', pausedSec: 0, paused: false, pausedAt: null, itemCount: 2, locationShared: false }, 'u1', 0);
  mockStored.outbox = [{ kind: 'end', activityId: 'a1', body: snapshot }];
  const mutate = jest.fn().mockRejectedValue(new ApiError('CONFLICT'));
  const get = jest.fn().mockResolvedValue({ data: { ...snapshot, id: 'a1', status: 'ENDED', itemCount: 0, byCategory: {} } });
  expect(await syncOutbox({ mutate, get } as unknown as ApiClient)).toBe(false);
  expect(mockStored.outbox).toHaveLength(1);
});

test('다음 요청 실패 전에 성공한 요청을 디스크 상태에서 제거한다', async () => {
  const first: Op = { kind: 'pause', activityId: 'a1' };
  const second: Op = { kind: 'resume', activityId: 'a1' };
  mockStored.outbox = [first, second];
  const mutate = jest.fn()
    .mockImplementationOnce(async () => {})
    .mockImplementationOnce(async () => {
      expect(mockStored.outbox).toEqual([second]);
      throw new Error('offline');
    });
  await syncOutbox({ mutate } as unknown as ApiClient);
  expect(mockStored.outbox).toEqual([second]);
});

test('전송 중 추가한 종료 요청도 진행 중인 동기화가 순서대로 보낸다', async () => {
  const first: Op = { kind: 'pause', activityId: 'a1' };
  const second: Op = { kind: 'resume', activityId: 'a1' };
  mockStored.outbox = [first];
  const mutate = jest.fn().mockImplementationOnce(async () => {
    mockStored.outbox = [...mockStored.outbox, second];
  }).mockResolvedValue({});
  await syncOutbox({ mutate } as unknown as ApiClient);
  expect(mutate.mock.calls.map(([path]) => path)).toEqual(['POST /activities/{id}/pause', 'POST /activities/{id}/resume']);
  expect(mockStored.outbox).toEqual([]);
});

test.each(['permission', 'services'])('위치 %s가 꺼지면 마지막 좌표를 보내지 않는다', async (off) => {
  const session = newSession({ id: 'a1', startedAt: '2026-09-30T00:00:00Z', pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: true }, 'u1', 0);
  mockStored.session = { ...session, here: { latitude: 37, longitude: 127, accuracy: 5 } };
  if (off === 'permission') mockPermission.mockResolvedValue({ granted: false });
  else mockEnabled.mockResolvedValue(false);
  await tick(off === 'permission' ? 10_000 : 20_000);
  expect(mockMutate).toHaveBeenCalledWith('POST /activities/{id}/live', expect.objectContaining({ location: null }));
});

describe('걸음수 갱신', () => {
  const T0 = Date.parse('2026-10-07T10:00:00Z');
  const active = () => newSession({ id: 'a1', startedAt: new Date(T0).toISOString(), pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: true }, 'u1', T0);
  const source = (n: number | Error): StepSource => ({ status: async () => 'granted', count: async () => { if (n instanceof Error) throw n; return n; } });

  test('읽은 걸음수를 진행 중 활동에 남긴다', async () => {
    mockStored = { session: active(), ended: null, outbox: [] };
    await refreshSteps(T0 + 60_000, source(120));
    expect(mockStored.session?.steps).toBe(120);
  });

  test('24시간이 지나서 읽어도 걸음은 시작 + 24시간까지만 센다', async () => {
    mockStored = { session: active(), ended: null, outbox: [] };
    const count = jest.fn(async () => 9_000);
    await refreshSteps(T0 + 25 * 3_600_000, { status: async () => 'granted', count });
    expect(count).toHaveBeenCalledWith(new Date(T0).toISOString(), new Date(T0 + 24 * 3_600_000).toISOString());
  });

  const H = 3_600_000;
  const iso = (t: number) => new Date(t).toISOString();
  test.each<[string, (s: Session) => Session, [string, string][]]>([
    ['24.5시간에 멈춘 채인', (s) => pause(s, T0 + 24.5 * H), [[iso(T0), iso(T0 + 24 * H)]]],
    ['24.5시간에 멈추고 25시간에 재개한', (s) => resume(pause(s, T0 + 24.5 * H), T0 + 25 * H), [[iso(T0), iso(T0 + 24 * H)]]],
    ['23시간에 멈추고 26시간에 재개한', (s) => resume(pause(s, T0 + 23 * H), T0 + 26 * H), [[iso(T0), iso(T0 + 23 * H)]]],
  ])('%s 활동을 24시간 뒤에 읽어도 24시간 안의 활동 구간만 센다', async (_label, make, spans) => {
    mockStored = { session: make(active()), ended: null, outbox: [] };
    const count = jest.fn(async (_from: string, _to: string) => 100);
    await refreshSteps(T0 + 27 * H, { status: async () => 'granted', count });
    expect(count.mock.calls).toEqual(spans);
  });

  test('못 읽으면 앞서 잰 값도 버린다 — 낡은 걸음이 지금 GPS 거리와 대조되지 않는다', async () => {
    mockStored = { session: { ...active(), steps: 120 }, ended: null, outbox: [] };
    await refreshSteps(T0 + 120_000, source(new Error('remote')));
    expect(mockStored.session?.steps).toBeNull();
  });

  test('권한을 거두면 걸음수를 버리고 GPS 거리로 기록한다', async () => {
    mockStored = { session: { ...active(), steps: 100, distanceM: 1_000 }, ended: null, outbox: [] };
    await refreshSteps(T0 + 120_000, { status: async () => 'denied', count: async () => 999 });
    expect(mockStored.session?.steps).toBeNull();
    expect(displayDistance(mockStored.session!)).toBe(1_000);
  });

  test('읽는 사이 활동이 끝났으면 건드리지 않는다', async () => {
    mockStored = { session: active(), ended: null, outbox: [] };
    const slow: StepSource = { status: async () => 'granted', count: async () => { mockStored = { ...mockStored, ended: true }; return 50; } };
    await refreshSteps(T0 + 60_000, slow);
    expect(mockStored.session?.steps).toBeNull();
  });

  test('앞선 읽기가 끝나기 전 다음 읽기는 건너뛴다 — 늦게 온 옛 값이 새 값을 덮지 않는다', async () => {
    mockStored = { session: active(), ended: null, outbox: [] };
    let finish!: (n: number) => void;
    const slow: StepSource = { status: async () => 'granted', count: () => new Promise((r) => { finish = r; }) };
    const first = refreshSteps(T0 + 60_000, slow);
    await refreshSteps(T0 + 75_000, source(999));
    expect(mockStored.session?.steps).toBeNull();
    finish(100);
    await first;
    expect(mockStored.session?.steps).toBe(100);
  });

  test('종료 직전 읽기는 진행 중인 읽기를 기다린 뒤 한 번 더 읽는다', async () => {
    mockStored = { session: { ...active(), steps: 100 }, ended: null, outbox: [] };
    let finish!: (n: number) => void;
    const slow: StepSource = { status: async () => 'granted', count: () => new Promise((r) => { finish = r; }) };
    const running = refreshSteps(T0 + 60_000, slow);
    const count = jest.fn(async () => 115);
    jest.spyOn(Date, 'now').mockReturnValue(T0 + 70_000);
    const final = finalSteps({ status: async () => 'granted', count });
    await new Promise((r) => setImmediate(r));
    expect(count).not.toHaveBeenCalled();
    finish(100);
    await Promise.all([running, final]);
    expect(count).toHaveBeenCalledTimes(1);
    expect(mockStored.session?.steps).toBe(115);
    jest.restoreAllMocks();
  });

  test('일시정지 중에도 일시정지 시각까지만 다시 읽는다 — 늦게 쓰인 직전 걸음을 담고, 멈춘 뒤 걸음은 빠진다', async () => {
    const pausedAt = new Date(T0 + 69_000).toISOString();
    mockStored = { session: { ...active(), paused: true, pausedAt, steps: 100 }, ended: null, outbox: [] };
    const count = jest.fn(async () => 115);
    await refreshSteps(T0 + 120_000, { status: async () => 'granted', count });
    expect(count).toHaveBeenCalledWith(new Date(T0).toISOString(), pausedAt);
    expect(mockStored.session?.steps).toBe(115);
  });
});


describe('24시간이 지나고 자동 종료 전', () => {
  const S = Date.parse('2026-09-30T00:00:00Z');
  const H = 3_600_000;

  test.each<[string, number, (s: Session) => Session]>([
    ['활동 중인', 25, (s) => s],
    ['24.5시간에 멈춘', 26, (s) => pause(s, S + 24.5 * H)],
  ])('%s 활동의 실시간 경과 시간과 알림 문구는 24시간까지다', async (_label, hours, make) => {
    mockStored.session = make(newSession({ id: 'a1', startedAt: new Date(S).toISOString(), pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: false }, 'u1', S));
    await tick(S + hours * H);
    expect(mockMutate).toHaveBeenLastCalledWith('POST /activities/{id}/live', expect.objectContaining({ elapsedSec: 86_400 }));
    const { updateTrackingNotification } = jest.requireMock('../../modules/tracking-notification') as { updateTrackingNotification: jest.Mock };
    expect(updateTrackingNotification).toHaveBeenLastCalledWith('gachi-activity-tracking', expect.any(String), expect.stringContaining('24:00:00'), expect.any(String));
  });
});

describe('배경 위치 작업', () => {
  const task = () => (jest.requireMock('expo-task-manager').defineTask as jest.Mock).mock.calls[0][1] as (body: unknown) => Promise<void>;
  const fixAt = (t: number) => ({ coords: { latitude: 37.5, longitude: 127, accuracy: 5 }, timestamp: t });
  // 실시간 송신은 5초에 한 번이다. 앞 테스트의 송신 시각에 막히지 않게 테스트마다 1분씩 시계를 민다
  let clock = Date.parse('2027-01-01T00:00:00Z');
  let now: jest.SpyInstance;
  beforeEach(() => {
    clock += 60_000;
    now = jest.spyOn(Date, 'now').mockReturnValue(clock);
  });
  afterEach(() => now.mockRestore());

  test.each(['ended', 'saveFailed'] as const)('화면이 없어도 위치가 들어올 때 24시간이 지났는지 보고, 끝내려 했으면(%s) 저장에 실패해도 실시간 위치를 보내지 않는다', async (result) => {
    mockStored.session = newSession({ id: 'a1', startedAt: new Date(Date.now() - 25 * 3_600_000).toISOString(), pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: true }, 'u1', 0);
    mockEndIfExpired.mockClear().mockResolvedValueOnce(result);
    await task()({ data: { locations: [fixAt(Date.now())] }, error: null });
    expect(mockEndIfExpired).toHaveBeenCalledTimes(1);
    expect(mockMutate).not.toHaveBeenCalledWith('POST /activities/{id}/live', expect.anything());
  });

  test('24시간 전이면 위치를 받은 뒤 실시간 위치를 보낸다', async () => {
    mockStored.session = newSession({ id: 'a1', startedAt: new Date(Date.now() - 3_600_000).toISOString(), pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: true }, 'u1', 0);
    mockEndIfExpired.mockResolvedValueOnce(null);
    await task()({ data: { locations: [fixAt(Date.now())] }, error: null });
    expect(mockMutate).toHaveBeenCalledWith('POST /activities/{id}/live', expect.objectContaining({ id: 'a1' }));
  });
});

describe('추적 중지', () => {
  const notFound = () => Object.assign(new Error('Task not found'), { code: 'E_TASK_NOT_FOUND' });

  test('시작 여부 조회를 기다리지 않고 같은 틱에 중지를 건다 — 기다리는 사이 다른 계정의 추적이 시작돼도 꺼지지 않게', async () => {
    mockHasStarted.mockReturnValue(new Promise(() => {}));
    const stopping = stopTracking();
    expect(mockStopLocation).toHaveBeenCalledWith(TRACKING_TASK);
    await stopping;
  });

  test('시작되지 않은 작업을 멈추려는 예외는 흡수한다', async () => {
    mockStopLocation.mockRejectedValue(notFound());
    await expect(stopTracking()).resolves.toBeUndefined();
  });

  describe('활동 종료', () => {
    const { endActivity } = jest.requireActual('./actions') as typeof import('./actions');
    const open = () => newSession({ id: 'a1', startedAt: new Date().toISOString(), pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: false }, 'u1', Date.now());

    test('종료 기록을 남긴 뒤 시작 여부 조회가 끝나지 않아도 추적 중지를 건다', async () => {
      mockHasStarted.mockReturnValue(new Promise(() => {}));
      mockStored = { session: open(), ended: null, outbox: [] };
      await expect(endActivity('a1')).resolves.toBe('ended');
      expect(mockStopLocation).toHaveBeenCalledWith(TRACKING_TASK);
    });

    test('추적이 이미 꺼져 있어 중지가 거절돼도 종료는 끝난다', async () => {
      mockStopLocation.mockRejectedValue(notFound());
      mockStored = { session: open(), ended: null, outbox: [] };
      await expect(endActivity('a1')).resolves.toBe('ended');
      expect(mockStored.outbox).toEqual([expect.objectContaining({ kind: 'end', activityId: 'a1' })]);
    });
  });
});
