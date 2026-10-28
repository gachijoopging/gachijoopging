const snapshot = { endedAt: '2026-09-30T00:01:00Z', durationSec: 60, pausedSec: 0, distanceM: 10, steps: null, route: [] };
import { ApiError, NetworkError, createMockClient, type ApiClient } from '../api/client';
import type { Op } from './outbox';
import { undoItem } from './outbox';
import { displayDistance, newSession } from './session';
import { activityGoneCode, finalSteps, isSendingItem, refreshSteps, startTracking, syncOutbox, tick } from './tracking';
import type { StepSource } from './steps';

let mockStored: ReturnType<typeof import('./store')['getStored']>;
const mockMutate = jest.mocked(createMockClient().mutate);
const mockPermission = jest.fn().mockResolvedValue({ granted: true });
const mockEnabled = jest.fn().mockResolvedValue(true);
const mockStart = jest.fn().mockResolvedValue(undefined);
jest.mock('../api/client', () => {
  const client = { mutate: jest.fn().mockResolvedValue({}) };
  return { ...jest.requireActual('../api/client'), createMockClient: () => client };
});
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  hasStartedLocationUpdatesAsync: jest.fn().mockResolvedValue(true),
  startLocationUpdatesAsync: (...args: unknown[]) => mockStart(...args),
  getForegroundPermissionsAsync: (...args: unknown[]) => mockPermission(...args),
  hasServicesEnabledAsync: (...args: unknown[]) => mockEnabled(...args),
}));
const mockNetwork = jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true });
jest.mock('expo-network', () => ({ getNetworkStateAsync: () => mockNetwork() }));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('../../modules/tracking-notification', () => ({ updateTrackingNotification: jest.fn() }));
jest.mock('./store', () => ({
  getStored: () => mockStored,
  updateStored: (fn: (st: typeof mockStored) => typeof mockStored) => { mockStored = fn(mockStored); },
}));

beforeEach(() => {
  mockStored = { session: null, ended: null, outbox: [] };
  mockMutate.mockClear();
  mockPermission.mockResolvedValue({ granted: true });
  mockEnabled.mockResolvedValue(true);
  mockStart.mockClear();
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

describe('버린 사진 삭제', () => {
  const discard: Op = { kind: 'discardPhoto', activityId: 'a1', mediaId: 'm1' };
  const endOp: Op = { kind: 'end', activityId: 'a1', body: snapshot };
  const ended = { ...snapshot, id: 'a1', status: 'ENDED', itemCount: 0, byCategory: {} };
  const startedSession = () => newSession({ id: 'a1', startedAt: '2026-09-30T00:00:00Z', pausedSec: 0, paused: false, pausedAt: null, itemCount: 0, locationShared: false }, 'u1', 0);

  test('사진 id 로 서버에 삭제를 보낸다', async () => {
    mockStored.outbox = [discard];
    const mutate = jest.fn().mockResolvedValue(undefined);
    expect(await syncOutbox({ mutate } as unknown as ApiClient)).toBe(true);
    expect(mutate).toHaveBeenCalledWith('DELETE /media/{mediaId}', { mediaId: 'm1' });
    expect(mockStored.outbox).toEqual([]);
  });

  test.each(['FORBIDDEN', 'CONFLICT'])('%s 는 다시 보내도 같으므로 완료로 보고 뒤의 종료를 막지 않는다 — 활동이 사라졌다는 표시도 남기지 않는다', async (code) => {
    mockStored.session = startedSession();
    mockStored.ended = snapshot;
    mockStored.outbox = [discard, endOp];
    const mutate = jest.fn(async (path: string) => {
      if (path === 'DELETE /media/{mediaId}') throw new ApiError(code, undefined, 409);
      return { data: ended };
    });
    expect(await syncOutbox({ mutate } as unknown as ApiClient)).toBe(true);
    expect(mutate.mock.calls.map(([path]) => path)).toEqual(['DELETE /media/{mediaId}', 'POST /activities/{id}/end']);
    expect(mockStored.outbox).toEqual([]);
    expect(activityGoneCode()).toBeNull();
  });

  test('연결이 안 되면 그 자리에서 멈추고 삭제와 뒤의 종료를 남긴다', async () => {
    mockStored.session = startedSession();
    mockStored.ended = snapshot;
    mockStored.outbox = [discard, endOp];
    const mutate = jest.fn().mockRejectedValue(new NetworkError('OFFLINE'));
    expect(await syncOutbox({ mutate } as unknown as ApiClient)).toBe(false);
    expect(mutate.mock.calls.map(([path]) => path)).toEqual(['DELETE /media/{mediaId}']);
    expect(mockStored.outbox).toEqual([discard, endOp]);
  });

  test('줍기 전송의 FORBIDDEN 은 여전히 멈추고 활동이 사라졌다고 알린다', async () => {
    mockStored.outbox = [{ kind: 'items', activityId: 'a1', photoId: 'p1', items: [{ id: 'i1', category: 'CAN', quantity: 1 }] }, discard];
    const mutate = jest.fn().mockRejectedValue(new ApiError('FORBIDDEN', undefined, 403));
    expect(await syncOutbox({ mutate } as unknown as ApiClient)).toBe(false);
    expect(mockStored.outbox).toHaveLength(2);
    expect(activityGoneCode()).toBe('FORBIDDEN');
  });
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

